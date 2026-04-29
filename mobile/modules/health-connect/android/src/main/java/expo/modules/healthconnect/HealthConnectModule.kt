package expo.modules.healthconnect

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlin.reflect.KClass

/**
 * Custom Expo Module wrapping Android Health Connect via the official
 * androidx.health.connect SDK.
 *
 * Why we own this module instead of using react-native-health-connect:
 *  - That library's `requestPermission()` uses a `lateinit
 *    ActivityResultLauncher` registered via Activity.onCreate. Under
 *    Expo SDK 54 + new architecture the registration never fires and
 *    every permission call crashes with
 *    `kotlin.UninitializedPropertyAccessException: lateinit property
 *    requestPermission has not been initialized`.
 *  - Our app never appears in Health Connect's app list because the
 *    permission request never reaches the system.
 *
 * How we avoid the trap:
 *  - We use `activity.activityResultRegistry.register(key, contract)`
 *    instead of `registerForActivityResult(...)`. The registry-based
 *    form CAN be called outside onCreate (any time the activity is
 *    not DESTROYED), which is what we need from inside a JS-driven
 *    Promise callback.
 *  - Each request gets a unique key (UUID) and unregisters itself
 *    after firing the callback, so we never leak launchers.
 *
 * Exposed methods:
 *   getSdkStatus()                              → Int   (sync)
 *   getGrantedPermissions()                     → Promise<List<String>>
 *   requestPermissions(perms: List<String>)     → Promise<List<String>>
 *   readDailyAggregates(dateIso: String)        → Promise<Map<String, Any?>>
 *   openHealthConnectSettings()                 → void  (sync)
 */
class HealthConnectModule : Module() {

  // Coroutine scope tied to the module's lifecycle. Cancelled when
  // the JS engine shuts down so we don't leak workers.
  private val moduleJob: Job = SupervisorJob()
  private val moduleScope = CoroutineScope(Dispatchers.IO + moduleJob)

  override fun definition() = ModuleDefinition {
    Name("HealthConnect")

    Function("getSdkStatus") {
      HealthConnectClient.getSdkStatus(context)
    }

    Function("openHealthConnectSettings") {
      openSettings()
    }

    AsyncFunction("getGrantedPermissions") { promise: Promise ->
      moduleScope.launch {
        try {
          val client = HealthConnectClient.getOrCreate(context)
          val granted = client.permissionController.getGrantedPermissions()
          promise.resolve(granted.toList())
        } catch (e: Exception) {
          promise.reject("hc_get_perms_failed", e.message ?: "unknown error", e)
        }
      }
    }

    AsyncFunction("requestPermissions") { perms: List<String>, promise: Promise ->
      requestPermissionsImpl(perms, promise)
    }

    AsyncFunction("readDailyAggregates") { dateIso: String, promise: Promise ->
      moduleScope.launch {
        try {
          val result = readDailyAggregatesImpl(dateIso)
          promise.resolve(result)
        } catch (e: Exception) {
          promise.reject("hc_aggregate_failed", e.message ?: "unknown error", e)
        }
      }
    }

    // 2026-04-28 §14.5.2 expansion — exercise sessions (the path
    // for Garmin / Pixel Watch / Fitbit activities to flow through
    // HC) + sleep stage breakdown.
    AsyncFunction("readWorkoutSegments") { dateIso: String, promise: Promise ->
      moduleScope.launch {
        try {
          val result = readWorkoutSegmentsImpl(dateIso)
          promise.resolve(result)
        } catch (e: Exception) {
          promise.reject("hc_workouts_failed", e.message ?: "unknown error", e)
        }
      }
    }

    AsyncFunction("readSleepStages") { dateIso: String, promise: Promise ->
      moduleScope.launch {
        try {
          val result = readSleepStagesImpl(dateIso)
          promise.resolve(result)
        } catch (e: Exception) {
          promise.reject("hc_sleep_stages_failed", e.message ?: "unknown error", e)
        }
      }
    }

    OnDestroy {
      moduleJob.cancel()
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private val context: Context
    get() = appContext.reactContext
      ?: throw IllegalStateException("HealthConnect: React context unavailable")

  private val currentActivity: ComponentActivity?
    get() = appContext.currentActivity as? ComponentActivity

  private fun openSettings() {
    // Health Connect's settings intent is exposed under a constant
    // string. Falls back to launching the HC app directly if the
    // intent action isn't recognized on this device.
    val hcSettingsIntent = Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS").apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      context.startActivity(hcSettingsIntent)
      return
    } catch (_: Exception) { /* fall through */ }

    val pm = context.packageManager
    val launchIntent = pm.getLaunchIntentForPackage("com.google.android.apps.healthdata")
    launchIntent?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(it)
    }
  }

  private fun requestPermissionsImpl(perms: List<String>, promise: Promise) {
    val activity = currentActivity ?: run {
      promise.reject("no_activity",
        "No active ComponentActivity available. Health Connect permission requests require a host Activity.",
        null)
      return
    }

    try {
      val contract = PermissionController.createRequestPermissionResultContract()
      val key = "hc_perm_request_${UUID.randomUUID()}"

      // The registry-based register form can be invoked any time
      // before DESTROYED — unlike registerForActivityResult which
      // must be called from onCreate. This is what unlocks calling
      // from inside a JS-promise-driven flow without the lateinit
      // crash.
      var launcher: ActivityResultLauncher<Set<String>>? = null
      var resolved = false
      launcher = activity.activityResultRegistry.register(key, contract) { granted ->
        if (resolved) return@register
        resolved = true
        try {
          launcher?.unregister()
        } catch (_: Exception) { /* idempotent cleanup */ }
        promise.resolve(granted.toList())
      }
      launcher.launch(perms.toSet())
    } catch (e: Exception) {
      promise.reject("hc_request_failed", e.message ?: "unknown error", e)
    }
  }

  // Aggregates today's window of HC records. Returns a map shaped
  // for direct JSON serialization to JS. Each metric is computed
  // independently — a missing record type doesn't fail the whole
  // call; just leaves that metric null in the result.
  private suspend fun readDailyAggregatesImpl(dateIso: String): Map<String, Any?> {
    val client = HealthConnectClient.getOrCreate(context)

    val date = try { LocalDate.parse(dateIso) } catch (_: Exception) { LocalDate.now() }
    val zone = ZoneId.systemDefault()
    val start = date.atStartOfDay(zone).toInstant()
    val end = date.plusDays(1).atStartOfDay(zone).toInstant()
    val range = TimeRangeFilter.between(start, end)

    val out = mutableMapOf<String, Any?>(
      "steps" to null,
      "sleep_minutes" to null,
      "resting_hr" to null,
      "hrv_ms" to null,
      "active_kcal" to null,
    )

    // Steps — simple sum of Steps.count
    safeRead(client, StepsRecord::class, range)?.let { records ->
      if (records.isNotEmpty()) {
        out["steps"] = records.sumOf { it.count }.toInt()
      }
    }

    // Sleep — sum of session durations in minutes
    safeRead(client, SleepSessionRecord::class, range)?.let { records ->
      if (records.isNotEmpty()) {
        val totalMin = records.sumOf {
          Duration.between(it.startTime, it.endTime).toMinutes()
        }
        out["sleep_minutes"] = totalMin.toInt()
      }
    }

    // Heart Rate — approximate resting HR as the mean of the
    // bottom-10% of all samples in the day
    safeRead(client, HeartRateRecord::class, range)?.let { records ->
      val allBpm = records.flatMap { rec ->
        rec.samples.map { it.beatsPerMinute }
      }
      if (allBpm.isNotEmpty()) {
        val sorted = allBpm.sorted()
        val tenPct = (sorted.size * 0.1).toInt().coerceAtLeast(1)
        val avgLow = sorted.take(tenPct).average()
        out["resting_hr"] = avgLow.toInt()
      }
    }

    // HRV (RMSSD) — simple average across the day's samples
    safeRead(client, HeartRateVariabilityRmssdRecord::class, range)?.let { records ->
      if (records.isNotEmpty()) {
        val avg = records.map { it.heartRateVariabilityMillis }.average()
        out["hrv_ms"] = avg.toInt()
      }
    }

    // Active calories — sum
    safeRead(client, ActiveCaloriesBurnedRecord::class, range)?.let { records ->
      if (records.isNotEmpty()) {
        val total = records.sumOf { it.energy.inKilocalories }
        out["active_kcal"] = total.toInt()
      }
    }

    return out
  }

  // 2026-04-28 §14.5.2 — workout segments. Each entry is one
  // ExerciseSessionRecord — start/end times, exercise type code,
  // optional title/notes. This is the path for Garmin / Pixel
  // Watch / Fitbit activities to flow through HC into the app
  // (the user toggles their wearable's "share with Health Connect"
  // setting; their watch app writes ExerciseSessionRecord rows
  // and we read them here).
  private suspend fun readWorkoutSegmentsImpl(dateIso: String): List<Map<String, Any?>> {
    val client = HealthConnectClient.getOrCreate(context)
    val date = try { LocalDate.parse(dateIso) } catch (_: Exception) { LocalDate.now() }
    val zone = ZoneId.systemDefault()
    val start = date.atStartOfDay(zone).toInstant()
    val end = date.plusDays(1).atStartOfDay(zone).toInstant()
    val range = TimeRangeFilter.between(start, end)

    val out = mutableListOf<Map<String, Any?>>()
    safeRead(client, ExerciseSessionRecord::class, range)?.forEach { rec ->
      val durationMin = Duration.between(rec.startTime, rec.endTime).toMinutes()
      out.add(mapOf(
        "start_iso"      to rec.startTime.toString(),
        "end_iso"        to rec.endTime.toString(),
        "duration_min"   to durationMin.toInt(),
        // exerciseType is an Int code — the JS side maps codes to
        // human labels via a lookup table. Passing the int keeps
        // this layer dumb.
        "exercise_type"  to rec.exerciseType,
        "title"          to (rec.title ?: ""),
        "notes"          to (rec.notes ?: ""),
      ))
    }
    return out
  }

  // 2026-04-28 §14.5.2 — sleep stage breakdown. The session.stages
  // collection inside each SleepSessionRecord lists the time the
  // person spent in each stage (awake, light, deep, REM). When a
  // wearable reports stages we sum minutes per stage; when only
  // total session is reported, only `total` is non-zero.
  private suspend fun readSleepStagesImpl(dateIso: String): Map<String, Int> {
    val client = HealthConnectClient.getOrCreate(context)
    val date = try { LocalDate.parse(dateIso) } catch (_: Exception) { LocalDate.now() }
    val zone = ZoneId.systemDefault()
    // Sleep typically spans the prior evening through morning of
    // dateIso. Pull a window that covers both — yesterday 18:00 to
    // dateIso 18:00. The session-end-time check decides whether
    // each session belongs to dateIso's "last night" rollup.
    val start = date.minusDays(1).atTime(18, 0).atZone(zone).toInstant()
    val end = date.atTime(18, 0).atZone(zone).toInstant()
    val range = TimeRangeFilter.between(start, end)

    val totals = mutableMapOf("total" to 0, "awake" to 0, "light" to 0, "deep" to 0, "rem" to 0)
    safeRead(client, SleepSessionRecord::class, range)?.forEach { session ->
      // Total session length (regardless of stages reported).
      val sessionMin = Duration.between(session.startTime, session.endTime).toMinutes().toInt()
      totals["total"] = totals.getValue("total") + sessionMin
      // Per-stage minutes when the wearable supplied them.
      session.stages.forEach { stage ->
        val mins = Duration.between(stage.startTime, stage.endTime).toMinutes().toInt()
        // SleepSessionRecord.Stage.STAGE_TYPE_AWAKE / LIGHT / DEEP / REM ints.
        // Constants live on the SleepSessionRecord companion.
        val key = when (stage.stage) {
          SleepSessionRecord.STAGE_TYPE_AWAKE,
          SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> "awake"
          SleepSessionRecord.STAGE_TYPE_LIGHT        -> "light"
          SleepSessionRecord.STAGE_TYPE_DEEP         -> "deep"
          SleepSessionRecord.STAGE_TYPE_REM          -> "rem"
          else                                       -> null
        }
        if (key != null) {
          totals[key] = totals.getValue(key) + mins
        }
      }
    }
    return totals
  }

  private suspend fun <T : androidx.health.connect.client.records.Record> safeRead(
    client: HealthConnectClient,
    recordClass: KClass<T>,
    range: TimeRangeFilter,
  ): List<T>? = try {
    client.readRecords(ReadRecordsRequest(recordClass, range)).records
  } catch (_: SecurityException) {
    // Permission not granted for this record type — caller will
    // see null and treat it as "metric unavailable" rather than
    // failing the whole aggregate.
    null
  } catch (_: Exception) {
    null
  }
}
