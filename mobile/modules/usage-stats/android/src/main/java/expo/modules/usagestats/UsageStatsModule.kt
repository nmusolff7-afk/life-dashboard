package expo.modules.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Custom Expo Module wrapping Android's UsageStatsManager.
 *
 * Replaces react-native-usage-stats-manager (npm), which uses Gradle 4
 * `compile()` dependency syntax that was removed in Gradle 7+. By
 * owning the wrapper ourselves we avoid abandonware risk and can
 * extend it (e.g. to query usage events for pickup counts) without
 * waiting on a maintainer who hasn't shipped since 2020.
 *
 * Three exposed methods:
 *   hasPermission()              — synchronous Boolean (cheap AppOps check)
 *   openUsageAccessSettings()    — fire-and-forget Intent
 *   queryDailyStats(dateIso)     — async, returns { total_minutes, top_apps[] }
 */
class UsageStatsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UsageStats")

    Function("hasPermission") {
      hasUsageAccess()
    }

    Function("openUsageAccessSettings") {
      openSettings()
    }

    AsyncFunction("queryDailyStats") { dateIso: String ->
      buildDailyStats(dateIso)
    }
  }

  // Resolves to the host React context. Throws if called before the
  // bridge is ready — should never happen in our flow because the JS
  // side calls these only after the module is mounted.
  private val context: Context
    get() = appContext.reactContext
      ?: throw IllegalStateException("UsageStats: React context unavailable")

  private fun hasUsageAccess(): Boolean {
    // The official way to check PACKAGE_USAGE_STATS — checkOpNoThrow
    // returns MODE_ALLOWED only after the user toggles the app on in
    // Settings → Apps → Special access → Usage access.
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      Process.myUid(),
      context.packageName,
    )
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun openSettings() {
    val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
  }

  private fun buildDailyStats(dateIso: String): Map<String, Any> {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val (start, end) = parseDayRange(dateIso)

    val rows = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end)
      ?: emptyList<android.app.usage.UsageStats>()

    val pm = context.packageManager
    val ourPackage = context.packageName

    var totalMs: Long = 0
    val apps = mutableListOf<Map<String, Any>>()

    for (row in rows) {
      val pkg = row.packageName ?: continue
      val ms = row.totalTimeInForeground
      if (ms <= 0) continue

      // Skip system-noise packages that pollute the top-apps list.
      if (isSystemNoise(pkg)) continue
      // Skip ourselves — the user doesn't want to see "Life Dashboard:
      // 4 hours" when we're the thing reporting the data.
      if (pkg == ourPackage) continue

      totalMs += ms

      val label = try {
        val info = pm.getApplicationInfo(pkg, 0)
        pm.getApplicationLabel(info).toString()
      } catch (_: Exception) {
        pkg
      }

      apps.add(
        mapOf(
          "package" to pkg,
          "label" to label,
          "minutes" to (ms / 60_000L).toInt(),
        ),
      )
    }

    apps.sortByDescending { (it["minutes"] as Int) }

    return mapOf(
      "total_minutes" to (totalMs / 60_000L).toInt(),
      "top_apps" to apps.take(10),
    )
  }

  private fun parseDayRange(dateIso: String): Pair<Long, Long> {
    // Treat dateIso as the user's local-day. Start = local midnight,
    // end = local midnight + 24h. Falls back to "last 24 hours" if
    // parsing fails so we never throw mid-query.
    return try {
      val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getDefault()
      }
      val day: Date = sdf.parse(dateIso) ?: throw IllegalArgumentException()
      val start = day.time
      val end = start + 86_400_000L
      Pair(start, end)
    } catch (_: Exception) {
      val now = System.currentTimeMillis()
      Pair(now - 86_400_000L, now)
    }
  }

  private fun isSystemNoise(pkg: String): Boolean {
    return pkg.startsWith("com.android.systemui") ||
      pkg.startsWith("com.android.launcher") ||
      pkg.startsWith("com.google.android.apps.nexuslauncher") ||
      pkg == "android" ||
      pkg.startsWith("com.android.settings")
  }
}
