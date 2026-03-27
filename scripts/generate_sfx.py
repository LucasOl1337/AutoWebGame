import requests
import json
import os

api_key = os.environ.get("ELEVENLABS_API_KEY")
if not api_key:
    raise RuntimeError("Set ELEVENLABS_API_KEY before running this script.")

url = "https://api.elevenlabs.io/v1/sound-generation"

headers = {
    "Accept": "audio/mpeg",
    "Content-Type": "application/json",
    "xi-api-key": api_key
}

sfx_prompts = {
    "bomb_place.mp3": "Short metallic clunk sound, like placing a heavy round object on a hard floor, followed by a faint electronic hum activating. Sci-fi tone, punchy and dry.",
    "bomb_explode.mp3": "Powerful mid-range explosion with a sharp initial crack followed by a sci-fi energy burst. Not too bass-heavy, feels electronic and contained like an arena detonation. Ends with a quick tail of crackling energy.",
    "flame_ignite.mp3": "A fast whooshing fire burst, like flames rapidly expanding in multiple directions. Crisp, energetic, with a slight electric crackle mixed in. Short and punchy.",
    "crate_break.mp3": "A wooden crate being smashed and splintered apart by an explosion. A sharp crack followed by debris scattering sounds. Slightly muffled to feel like it happened inside an arena.",
    "player_death.mp3": "A dramatic sci-fi defeat sound: electronic distortion fading out, like a robot powering down after being hit. Starts with a quick burst of noise then fades to silence with a descending pitch.",
    "powerup_collect.mp3": "A satisfying chime-like pickup sound, electronic and bright. A quick ascending arpeggio of two or three notes, like collecting an item in a sci-fi game. Feels rewarding and crisp.",
    "match_start.mp3": "An arena ready sound, building tension for 0.8 seconds then releasing with a powerful energetic burst. Like a countdown ending and the gates opening. Sci-fi fanfare feel.",
    "round_win.mp3": "A triumphant short fanfare, like a brief victory jingle. Electronic and punchy, not too long. Feels like round completion in an arcade game.",
    "match_win.mp3": "A full victory fanfare, bright and energetic. Rising electronic tones building to a satisfying peak, like winning an arcade match. Memorable and celebratory.",
    "shield_block.mp3": "A short defensive shimmer with a crisp impact, like an energy shield absorbing a flame burst. Sci-fi, bright, and fast.",
    "sudden_death.mp3": "A brief alarm sting that signals the arena entering sudden death. Urgent, electronic, and arcade-like without being too long."
}

out_dir = r"c:\Users\user\Desktop\AutoWebGame\public\assets\audio\sfx"
os.makedirs(out_dir, exist_ok=True)

import time

for filename, text in sfx_prompts.items():
    filepath = os.path.join(out_dir, filename)
    if os.path.exists(filepath):
        print(f"Skipping {filename}, already exists")
        continue

    print(f"Generating {filename}...")
    data = {
        "text": text,
        "prompt_influence": 0.3
    }
    
    # Optional duration parameter is sometimes not accepted without exact match, let's leave it out
    try:
        response = requests.post(url, json=data, headers=headers)
        if response.status_code == 200:
            with open(filepath, "wb") as f:
                f.write(response.content)
            print(f"Saved {filename}")
        else:
            print(f"Error for {filename}: {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")
    
    time.sleep(1) # simple rate limit
