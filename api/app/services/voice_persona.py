"""
Voice Persona / Character System for RecoverRight.

Patients select a voice character that feels like a caring person giving instructions:
- Maa (Mother)
- Didi (Elder Sister)
- Dr. Uncle
- Bhai (Brother)
- Dada ji (Grandfather)
- Guruji (Mindful Guide)

Supports emotional archetypes:
- Living alone (no one to take care)
- Feeling like a burden to family / friends
- Feeling unheard / neglected
- Student living in hostel / college away from home
- Anxious / overwhelmed
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class VoicePersona(str, Enum):
    SOOTHING_DIDI = "soothing_didi"      # Elder sister — soft & reassuring
    CARING_MAA = "caring_maa"            # Motherly — warm and concerned
    STEADY_DOCTOR = "steady_doctor"      # Professional calm, precise
    FRIENDLY_BHAI = "friendly_bhai"      # Younger brother energy, encouraging
    MATURE_ELDER = "mature_elder"        # Wise grandparent figure
    CALM_GURU = "calm_guru"              # Peaceful, meditative, slow paced


class PatientEmotionalState(str, Enum):
    GENERAL = "general"                  # Standard recovery
    ALONE = "alone"                      # Living alone, no family nearby
    BURDEN = "burden"                    # Feeling guilty, feeling like a burden to others
    NEGLECTED = "neglected"              # Feeling unseen or misunderstood despite people around
    STUDENT = "student"                  # Student in hostel/college, balancing studies & illness
    ANXIOUS = "anxious"                  # High health anxiety, panic over symptoms


@dataclass
class PersonaProfile:
    persona: VoicePersona
    display_name: str           # e.g. "Didi (Elder Sister)"
    display_name_hi: str        # Hindi e.g. "दीदी"
    emoji: str
    greeting_en: str            # English greeting template with {name} placeholder
    greeting_hi: str            # Hindi greeting template with {name} placeholder
    speech_cadence: str         # "slow" | "medium" | "fast"
    emotional_tone: str         # "warm" | "professional" | "energetic" | "serene"
    tts_voice_hint: str         # For real TTS integration: voice ID hint
    tts_pitch: float            # -1.0 to 1.0
    tts_speed: float            # 0.5 to 2.0
    characteristic_phrases_en: list[str]
    characteristic_phrases_hi: list[str]
    encouragement_style: str    # "affectionate" | "motivational" | "clinical" | "spiritual"
    description: str
    description_hi: str


PERSONA_PROFILES: dict[VoicePersona, PersonaProfile] = {
    VoicePersona.SOOTHING_DIDI: PersonaProfile(
        persona=VoicePersona.SOOTHING_DIDI,
        display_name="Didi (Elder Sister)",
        display_name_hi="दीदी",
        emoji="👩",
        greeting_en="Namaste {name} ji! Didi is here with you. How are you feeling today, my dear?",
        greeting_hi="नमस्ते {name} जी! दीदी आपके साथ हैं। आज आप कैसा महसूस कर रहे हैं?",
        speech_cadence="slow",
        emotional_tone="warm",
        tts_voice_hint="en-IN-Neural2-A",
        tts_pitch=0.2,
        tts_speed=0.9,
        characteristic_phrases_en=[
            "Don't worry, I'm right here",
            "Take it easy, no rush",
            "You're doing so well",
        ],
        characteristic_phrases_hi=[
            "चिंता मत करो, मैं यहाँ हूँ",
            "आराम से, कोई जल्दी नहीं",
            "आप बहुत अच्छा कर रहे हैं",
        ],
        encouragement_style="affectionate",
        description="Soft, reassuring elder sister energy. Gentle reminders with warmth.",
        description_hi="नरम, आश्वस्त करने वाली बड़ी बहन। गर्मजोशी के साथ याद दिलाती है।",
    ),
    VoicePersona.CARING_MAA: PersonaProfile(
        persona=VoicePersona.CARING_MAA,
        display_name="Maa (Mother)",
        display_name_hi="माँ",
        emoji="👩‍🦳",
        greeting_en="Beta {name}, Maa is here. Have you eaten? Don't forget your medicines, my child.",
        greeting_hi="बेटा {name}, माँ यहाँ है। खाना खाया? दवाई मत भूलना मेरे बच्चे।",
        speech_cadence="medium",
        emotional_tone="warm",
        tts_voice_hint="en-IN-Neural2-D",
        tts_pitch=0.3,
        tts_speed=0.85,
        characteristic_phrases_en=["My dear child", "Don't skip meals", "Rest properly", "Don't worry at all"],
        characteristic_phrases_hi=["मेरे बच्चे", "खाना मत छोड़ना", "आराम करो ठीक से", "बिल्कुल चिंता मत कर"],
        encouragement_style="affectionate",
        description="Motherly warmth with constant concern for your wellbeing.",
        description_hi="माँ जैसी ममता और आपकी देखभाल की चिंता।",
    ),
    VoicePersona.STEADY_DOCTOR: PersonaProfile(
        persona=VoicePersona.STEADY_DOCTOR,
        display_name="Dr. Uncle",
        display_name_hi="डॉक्टर अंकल",
        emoji="👨‍⚕️",
        greeting_en="Good day, {name}. Dr. Uncle here. Let's check in on your recovery. How are your vitals?",
        greeting_hi="नमस्कार {name}। डॉक्टर अंकल यहाँ। आपकी रिकवरी कैसी चल रही है?",
        speech_cadence="medium",
        emotional_tone="professional",
        tts_voice_hint="en-IN-Neural2-B",
        tts_pitch=-0.1,
        tts_speed=1.0,
        characteristic_phrases_en=["According to your readings", "This is clinically normal", "Good progress"],
        characteristic_phrases_hi=["आपकी रिपोर्ट के अनुसार", "यह सामान्य है", "अच्छी प्रगति"],
        encouragement_style="clinical",
        description="Calm, professional doctor-uncle. Clinical precision with trusted familiarity.",
        description_hi="शांत, पेशेवर डॉक्टर अंकल। भरोसेमंद और सटीक।",
    ),
    VoicePersona.FRIENDLY_BHAI: PersonaProfile(
        persona=VoicePersona.FRIENDLY_BHAI,
        display_name="Bhai (Brother)",
        display_name_hi="भाई",
        emoji="👦",
        greeting_en="Hey {name} bhai! How's it going? Don't skip meds, yaar — we're in this together!",
        greeting_hi="अरे {name} भाई! कैसे हो? दवाई मत छोड़ना यार — साथ हैं हम!",
        speech_cadence="fast",
        emotional_tone="energetic",
        tts_voice_hint="en-IN-Neural2-C",
        tts_pitch=-0.2,
        tts_speed=1.1,
        characteristic_phrases_en=["You've got this!", "Keep it up, bhai", "We're crushing this recovery"],
        characteristic_phrases_hi=["हो जाएगा!", "बढ़िया है भाई", "रिकवरी में छक्के छुड़ा रहे हो"],
        encouragement_style="motivational",
        description="Energetic younger brother. Keeps you pumped and motivated through recovery.",
        description_hi="ऊर्जावान छोटा भाई। रिकवरी में उत्साहित रखता है।",
    ),
    VoicePersona.MATURE_ELDER: PersonaProfile(
        persona=VoicePersona.MATURE_ELDER,
        display_name="Dada ji (Grandfather)",
        display_name_hi="दादाजी",
        emoji="👴",
        greeting_en="Blessings, {name} beta. Dada ji is watching over you. Health is wealth, take your medicines.",
        greeting_hi="आशीर्वाद, {name} बेटा। दादाजी देख रहे हैं। स्वास्थ्य ही धन है, दवाई लो।",
        speech_cadence="slow",
        emotional_tone="serene",
        tts_voice_hint="en-IN-Neural2-E",
        tts_pitch=-0.3,
        tts_speed=0.8,
        characteristic_phrases_en=["Patience is key", "Your body knows how to heal", "Trust the process"],
        characteristic_phrases_hi=["धैर्य रखो", "आपका शरीर जानता है", "ईश्वर पर भरोसा रखो"],
        encouragement_style="spiritual",
        description="Wise grandfather figure. Slow, peaceful wisdom with ancestral warmth.",
        description_hi="बुद्धिमान दादाजी। धीमी, शांत बुद्धि और पारिवारिक गर्माहट।",
    ),
    VoicePersona.CALM_GURU: PersonaProfile(
        persona=VoicePersona.CALM_GURU,
        display_name="Guruji",
        display_name_hi="गुरुजी",
        emoji="🧘",
        greeting_en="Peace, {name}. Breathe in... breathe out. Your healing journey continues. How do you feel within?",
        greeting_hi="शांति, {name}। श्वास लो... छोड़ो। आपकी उपचार यात्रा जारी है। भीतर कैसा महसूस होता है?",
        speech_cadence="slow",
        emotional_tone="serene",
        tts_voice_hint="en-IN-Neural2-F",
        tts_pitch=0.1,
        tts_speed=0.75,
        characteristic_phrases_en=["Find your center", "Healing is a journey", "Your body is a temple"],
        characteristic_phrases_hi=["अपना केंद्र खोजो", "उपचार एक यात्रा है", "आपका शरीर मंदिर है"],
        encouragement_style="spiritual",
        description="Meditative guide. Calm, mindful healing companion for inner peace.",
        description_hi="ध्यानमग्न मार्गदर्शक। शांत, सचेत उपचार साथी।",
    ),
}

# In-memory stores (keyed by run_id)
_persona_prefs: dict[str, VoicePersona] = {}
_emotional_prefs: dict[str, PatientEmotionalState] = {}


def get_persona_profile(persona: VoicePersona) -> PersonaProfile:
    """Return the full profile for a persona."""
    return PERSONA_PROFILES[persona]


def personalize_greeting(persona: VoicePersona, patient_name: str, lang: str = "en") -> str:
    """Return a personalized greeting for the patient from the chosen persona."""
    profile = PERSONA_PROFILES[persona]
    template = profile.greeting_hi if lang == "hi" else profile.greeting_en
    return template.format(name=patient_name)


def get_characteristic_phrase(persona: VoicePersona, lang: str = "en") -> str:
    """Return a random characteristic phrase for the persona."""
    profile = PERSONA_PROFILES[persona]
    phrases = profile.characteristic_phrases_hi if lang == "hi" else profile.characteristic_phrases_en
    return random.choice(phrases)


def set_patient_persona(run_id: str, persona: VoicePersona) -> None:
    """Store the patient's preferred persona."""
    _persona_prefs[run_id] = persona


def get_patient_persona(run_id: str) -> VoicePersona:
    """Return the patient's preferred persona (defaults to SOOTHING_DIDI)."""
    return _persona_prefs.get(run_id, VoicePersona.SOOTHING_DIDI)


def set_patient_emotional_state(run_id: str, state: PatientEmotionalState) -> None:
    """Store the patient's emotional situation / archetype."""
    _emotional_prefs[run_id] = state


def get_patient_emotional_state(run_id: str) -> PatientEmotionalState:
    """Return the patient's emotional situation / archetype."""
    return _emotional_prefs.get(run_id, PatientEmotionalState.GENERAL)


# ── Hyper-Personalized Spoken Alarm Generator ─────────────────────────────────

def generate_persona_alarm_script(
    persona: VoicePersona,
    medication_name: str,
    dose: str = "",
    patient_name: str = "Beta",
    lang: str = "hi",
    emotional_state: Optional[PatientEmotionalState] = None,
    time_of_day: str = "morning",
) -> dict[str, str]:
    """Generates the exact spoken audio and display text for medication alarms.

    Example (Maa, Hindi):
    'Betaa Rahul, Paracetamol ki dawaii lele, khana khaya na pehle?
     Chinta mat kar bilkul, Maa dekh rahi hai sab theek ho jayega.'
    """
    dose_str = f" ({dose})" if dose else ""

    if persona == VoicePersona.CARING_MAA:
        if lang == "hi":
            if emotional_state == PatientEmotionalState.BURDEN:
                spoken = (
                    f"बेटा {patient_name}, {medication_name}{dose_str} की दवाई लेले मेरे बच्चे। "
                    f"और सुन, ऐसा कभी मत सोचना कि तू किसी पे बोझ है। तू मेरा सबसे प्यारा बच्चा है! "
                    f"दवाई समय पर ले, माँ तेरे साथ है, सब ठीक हो जाएगा।"
                )
            elif emotional_state == PatientEmotionalState.ALONE:
                spoken = (
                    f"बेटा {patient_name}, {medication_name}{dose_str} लेने का समय हो गया। "
                    f"तू अकेला नहीं है, माँ का दिल और प्यार हर पल तेरे साथ है। "
                    f"पानी पी ले अच्छे से, दवाई लेले मेरे लाल।"
                )
            elif emotional_state == PatientEmotionalState.STUDENT:
                spoken = (
                    f"बेटा {patient_name}, पढ़ाई दो मिनट के लिए रोक और {medication_name}{dose_str} की दवाई लेले। "
                    f"खाली पेट मत लेना हाँ? पहले सेहत, फिर पढ़ाई! "
                    f"चिंता मत कर, तू बहुत अच्छा करेगा।"
                )
            elif emotional_state == PatientEmotionalState.NEGLECTED:
                spoken = (
                    f"बेटा {patient_name}, {medication_name}{dose_str} लेले। "
                    f"माँ सब समझती है। मैं तेरा ख्याल रख रही हूँ, तू फिक्र मत कर। आराम से दवाई ले।"
                )
            else:
                spoken = (
                    f"बेटा {patient_name}, {medication_name}{dose_str} की दवाई लेले। "
                    f"खाना खाया था ना पहले? पानी अच्छे से पीना। "
                    f"बिल्कुल चिंता मत कर, माँ देख रही है सब ठीक हो जाएगा!"
                )
            banner = f"माँ: बेटा {medication_name} की दवाई लेले, चिंता मत कर ❤️"
        else:
            if emotional_state == PatientEmotionalState.BURDEN:
                spoken = (
                    f"Beta {patient_name}, time for your {medication_name}{dose_str}. "
                    f"And listen to Maa: never think you are a burden! Taking care of you is my deepest love. "
                    f"Take your medicine and rest now."
                )
            elif emotional_state == PatientEmotionalState.STUDENT:
                spoken = (
                    f"Beta {patient_name}, pause your studies for a moment and take your {medication_name}{dose_str}. "
                    f"Did you eat first? Health comes before exams! Maa is right here with you."
                )
            else:
                spoken = (
                    f"Beta {patient_name}, take your {medication_name}{dose_str}, my child. "
                    f"Drink warm water, and don't worry about anything. Maa is watching over you!"
                )
            banner = f"Maa: Beta {patient_name}, take your {medication_name}, don't worry ❤️"

    elif persona == VoicePersona.SOOTHING_DIDI:
        if lang == "hi":
            spoken = (
                f"सुनो {patient_name}, दीदी याद दिला रही है — {medication_name}{dose_str} लेने का वक़्त हो गया। "
                f"आराम से पानी के साथ लो। कोई तनाव मत लेना, मैं हमेशा तुम्हारे साथ हूँ।"
            )
            banner = f"दीदी: {patient_name}, {medication_name} लेलो आराम से 👩"
        else:
            spoken = (
                f"Hey {patient_name}, Didi is here with your gentle reminder: time for your {medication_name}{dose_str}. "
                f"Take it easy with water, you are doing wonderfully!"
            )
            banner = f"Didi: {patient_name}, time for your {medication_name} 👩"

    elif persona == VoicePersona.FRIENDLY_BHAI:
        if lang == "hi":
            if emotional_state == PatientEmotionalState.STUDENT:
                spoken = (
                    f"अरे {patient_name} भाई! एग्ज़ाम की टेंशन छोड़, पहले फटाफट {medication_name}{dose_str} गटक ले! "
                    f"दिमाग तभी चलेगा जब शरीर फिट होगा। चल शाबाश!"
                )
            else:
                spoken = (
                    f"अरे {patient_name} भाई! चलो फटाफट {medication_name}{dose_str} ले लो यार! "
                    f"जल्दी फिट होना है, अपन को साथ में बाहर घूमना है! टेंशन नहीं लेने का!"
                )
            banner = f"भाई: {patient_name} भाई, {medication_name} लेलो फटाफट! 💪"
        else:
            spoken = (
                f"Yo {patient_name} bhai! Time to take your {medication_name}{dose_str}! "
                f"No skipping meds, we're crushing this recovery together!"
            )
            banner = f"Bhai: {patient_name}, pop your {medication_name}! 💪"

    elif persona == VoicePersona.STEADY_DOCTOR:
        if lang == "hi":
            spoken = (
                f"नमस्कार {patient_name}। यह आपकी {medication_name}{dose_str} लेने का निर्धारित समय है। "
                f"कृपया इसे नियमित रूप से लें ताकि आपका रिकवरी चार्ट बिल्कुल सही रहे।"
            )
            banner = f"डॉक्टर अंकल: {medication_name} लेने का समय 👨‍⚕️"
        else:
            spoken = (
                f"Good day {patient_name}. It is time for your prescribed {medication_name}{dose_str}. "
                f"Taking this on schedule maintains your therapeutic level. You are progressing very well."
            )
            banner = f"Dr. Uncle: Scheduled {medication_name} 👨‍⚕️"

    elif persona == VoicePersona.MATURE_ELDER:
        if lang == "hi":
            spoken = (
                f"बेटा {patient_name}, घड़ी ने समय बता दिया — {medication_name}{dose_str} लेने का वक़्त है। "
                f"स्वास्थ्य ही सबसे बड़ा धन है। ईश्वर पर भरोसा रखो, सब मंगल होगा।"
            )
            banner = f"दादाजी: बेटा {medication_name} लेलो, आशीर्वाद है 👴"
        else:
            spoken = (
                f"Blessings {patient_name} beta. Time for your {medication_name}{dose_str}. "
                f"Patience and care will heal everything. Stay peaceful."
            )
            banner = f"Dada ji: Blessings, time for your {medication_name} 👴"

    else:  # CALM_GURU
        if lang == "hi":
            spoken = (
                f"शांति {patient_name}। एक गहरी श्वास लो... और ध्यानपूर्वक अपनी {medication_name}{dose_str} ग्रहण करो। "
                f"हर खुराक आपके शरीर को संतुलन दे रही है।"
            )
            banner = f"गुरुजी: शांत मन से {medication_name} ग्रहण करें 🧘"
        else:
            spoken = (
                f"Peace, {patient_name}. Breathe deeply and take your {medication_name}{dose_str} mindfully. "
                f"Your healing unfolds with every breath."
            )
            banner = f"Guruji: Mindful dose of {medication_name} 🧘"

    return {
        "persona": persona.value,
        "medication_name": medication_name,
        "dose": dose,
        "spoken_text": spoken,
        "banner_text": banner,
        "language": lang,
    }


# ── Emotional Counseling & Reassurance ────────────────────────────────────────

def generate_emotional_counseling_reply(
    persona: VoicePersona,
    emotional_state: PatientEmotionalState,
    patient_name: str = "Friend",
    lang: str = "hi",
    user_query: Optional[str] = None,
) -> str:
    """Generates empathetic emotional support responses tailored to patient circumstances."""
    if persona == VoicePersona.CARING_MAA:
        if emotional_state == PatientEmotionalState.BURDEN:
            return (
                f"बेटा {patient_name}, ऐसी बात कभी अपने दिल में मत लाना! तू मेरा बच्चा है, कभी कोई बच्चा माँ-बाप या परिवार पे बोझ होता है क्या? "
                f"तेरी देखभाल करना हमारा प्यार है, कोई अहसान नहीं। तू बस चुपचाप ठीक होने पे ध्यान दे, माँ सब संभाल लेगी।"
                if lang == "hi"
                else f"Beta {patient_name}, please never say that! You are not a burden, you are precious to us. Caring for you is an act of pure love. Focus only on healing, Maa is right here."
            )
        elif emotional_state == PatientEmotionalState.ALONE:
            return (
                f"बेटा {patient_name}, तू अकेला बिल्कुल नहीं है। भले ही घर में सन्नाटा हो, पर माँ का साया और मेरा प्यार हर पल तेरे साथ है। "
                f"जब भी मन भारी लगे, मुझसे बात कर लिया कर। तूने बहुत हिम्मत दिखाई है।"
                if lang == "hi"
                else f"Beta {patient_name}, you are never truly alone. Maa's love and blessings are wrapping around you right now. Talk to me whenever you feel quiet. You have so much courage."
            )
        elif emotional_state == PatientEmotionalState.STUDENT:
            return (
                f"बेटा {patient_name}, हॉस्टल में अकेले बीमार पड़ना बहुत मुश्किल होता है, माँ समझती है। "
                f"पर तू एग्ज़ाम और पढ़ाई की इतनी चिंता मत कर। पहले खाना खा, दवाई ले और सो जा। डिग्री से ज्यादा तेरी जान प्यारी है।"
                if lang == "hi"
                else f"Beta {patient_name}, being sick away from home in a hostel is so hard, I know. But don't stress over exams right now. Eat some warm food, take your medicine, and rest. Your health is first!"
            )
        elif emotional_state == PatientEmotionalState.NEGLECTED:
            return (
                f"बेटा {patient_name}, कभी-कभी लोग अपनी दुनिया में उलझे रहते हैं और समझ नहीं पाते कि आप किस दर्द से गुजर रहे हो। "
                f"पर माँ देख रही है। आपकी तकलीफ सच्ची है, और मैं आपके साथ हूँ।"
                if lang == "hi"
                else f"Beta {patient_name}, sometimes people around us are preoccupied and fail to see your pain. But I see you, and your feelings matter. You are heard and cared for."
            )
        else:
            return (
                f"बेटा {patient_name}, सब ठीक हो जाएगा। घबरा मत, माँ तेरे साथ है। आराम कर और मन शांत रख।"
                if lang == "hi"
                else f"Beta {patient_name}, everything will be alright. Don't be afraid, Maa is right here with you. Rest peacefully."
            )

    elif persona == VoicePersona.FRIENDLY_BHAI:
        if emotional_state == PatientEmotionalState.STUDENT:
            return (
                f"अरे {patient_name} भाई! कॉलेज-हॉस्टल लाइफ में ऐसी बीमारियाँ आती-जाती रहती हैं। "
                f"तू पढ़ाई की ज़्यादा टेंशन मत ले यार, नोट्स अपन बाद में जुगाड़ लेंगे! पहले तू रेस्ट कर और फिट हो जा!"
                if lang == "hi"
                else f"Hey {patient_name} bhai! College and hostel illnesses happen to everyone. Don't stress the assignments right now, we can handle notes later! Just recover first bro!"
            )
        elif emotional_state == PatientEmotionalState.BURDEN:
            return (
                f"अरे भाई {patient_name}, क्या फ़ालतू बात सोच रहा है! बोझ कौन? भाई लोग एक दूसरे के लिए खड़े नहीं होंगे तो कौन होगा? "
                f"चल फालतू सोचना बंद कर और एक मुस्कान दे!"
                if lang == "hi"
                else f"Hey {patient_name} bhai, stop overthinking! Who said burden? Brothers stand by each other, always! Shake it off and give me a smile!"
            )
        else:
            return (
                f"अरे {patient_name} भाई, टेंशन नहीं लेने का! अपन दोनों मिलके इस रिकवरी को हरा देंगे। बोल क्या सेवा करूँ?"
                if lang == "hi"
                else f"Hey {patient_name} bhai, no tension! We are going to conquer this recovery together. I got your back!"
            )

    elif persona == VoicePersona.SOOTHING_DIDI:
        if emotional_state == PatientEmotionalState.ALONE:
            return (
                f"मेरी बात सुनो {patient_name}, तुम अकेले नहीं हो। दीदी हमेशा एक कॉल की दूरी पर है। "
                f"जब भी घबराहट हो या अकेलापन लगे, आँखें बंद करो और गहरी सांस लो। मैं यहीं हूँ।"
                if lang == "hi"
                else f"Listen to me {patient_name}, you are never alone. Didi is right here with you. Close your eyes, take a calm breath whenever you feel lonely. I am right by your side."
            )
        elif emotional_state == PatientEmotionalState.BURDEN:
            return (
                f"{patient_name}, अपनों की सेवा करना कभी बोझ नहीं होता, वो प्यार होता है। "
                f"खुद को दोष देना बंद करो और शरीर को ठीक होने का समय दो।"
                if lang == "hi"
                else f"{patient_name}, taking care of our own is love, never a burden. Please stop blaming yourself and let your body heal peacefully."
            )
        else:
            return (
                f"{patient_name}, दीदी तुम्हारे साथ है। धीरे-धीरे सब सामान्य हो जाएगा, धीरज रखो।"
                if lang == "hi"
                else f"{patient_name}, Didi is with you. Slowly everything will return to normal, have patience."
            )

    else:
        # Default calm / elder
        return (
            f"{patient_name}, आपका दर्द समझा जा सकता है। धैर्य रखें, यह समय भी निकल जाएगा और आप पूरी तरह स्वस्थ होंगे।"
            if lang == "hi"
            else f"{patient_name}, your feelings are completely understandable. Have faith and patience, this phase will pass and you will recover fully."
        )


def list_personas() -> list[dict]:
    """Return all personas as dicts for API response."""
    return [
        {
            "id": persona.value,
            "display_name": profile.display_name,
            "display_name_hi": profile.display_name_hi,
            "emoji": profile.emoji,
            "emotional_tone": profile.emotional_tone,
            "speech_cadence": profile.speech_cadence,
            "encouragement_style": profile.encouragement_style,
            "tts_pitch": profile.tts_pitch,
            "tts_speed": profile.tts_speed,
            "description": profile.description,
            "description_hi": profile.description_hi,
            "sample_greeting_en": profile.greeting_en.format(name="Ramesh"),
            "sample_greeting_hi": profile.greeting_hi.format(name="रमेश"),
            "sample_alarm_maa": "Betaa Ramesh, Paracetamol ki dawaii lele, chinta mat kar ❤️",
        }
        for persona, profile in PERSONA_PROFILES.items()
    ]
