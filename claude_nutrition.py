import json
import anthropic

client = anthropic.Anthropic()

SYSTEM_PROMPT = """You are a nutrition expert. When given a meal description in plain English,
estimate the nutritional content. Always respond with a valid JSON object and nothing else.
Use your best judgment for portion sizes when not specified.

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "calories": <integer>,
  "protein_g": <number with one decimal>,
  "carbs_g": <number with one decimal>,
  "fat_g": <number with one decimal>,
  "notes": "<brief note about assumptions made, if any>"
}"""


def estimate_nutrition(meal_description: str) -> dict:
    """
    Call Claude to estimate calories and macros for a plain-English meal description.
    Returns a dict with calories, protein_g, carbs_g, fat_g, and notes.
    """
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=256,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": meal_description}
        ],
    )

    text = next(b.text for b in response.content if b.type == "text")
    # Strip markdown code fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    data = json.loads(text)

    return {
        "calories": int(data["calories"]),
        "protein_g": float(data["protein_g"]),
        "carbs_g": float(data["carbs_g"]),
        "fat_g": float(data["fat_g"]),
        "notes": data.get("notes", ""),
    }
