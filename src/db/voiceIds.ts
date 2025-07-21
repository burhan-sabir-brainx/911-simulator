// Local database of ElevenLabs voice names and their IDs
// Optimized for 911 emergency call character types and voice styles
// Based on voice patterns from 911_all_scripts.json

export interface VoiceEntry {
  name: string;
  id: string;
  description: string;
  characterTypes: string[];
}

export const voiceDatabase: VoiceEntry[] = [
  {
    name: "Default",
    id: "EXAVITQu4vr4xnSDxMaL",
    description: "Neutral default voice",
    characterTypes: ["fallback"]
  },
  {
    name: "Rachel",
    id: "21m00Tcm4TlvDq8ikWAM",
    description: "Versatile female voice - elderly, frightened, worried mothers, agitated women",
    characterTypes: ["Elderly Female", "Female Frightened", "Young Woman", "Agitated Older Woman", "Upset Mother", "Female Worried", "Older Female", "Mother Worried", "Flustered Woman", "Worried Woman", "Frantic Woman", "Breathless Woman"]
  },
  {
    name: "Josh",
    id: "TxGEqnHWrfWFTfGW9XjX",
    description: "Professional confident male voice - steady, direct, authoritative",
    characterTypes: ["Male Professional", "Male", "Adult Male in a Hurry", "Male Professional", "Confident Male", "Professional Male", "Security Operator", "Manager"]
  },
  {
    name: "Arnold",
    id: "ErXwobaYiN019PkySvjV",
    description: "Older male voice - anxious, worried fathers, angry older men",
    characterTypes: ["Male Older", "Older Male", "Father Worried", "Angry Older Male", "Professional Older Male", "Worried Father", "Anxious Male", "Older Male Professional"]
  },
  {
    name: "Elli",
    id: "MF3mGyEYCl7XYWbV9V6O",
    description: "Young female voice - calm, teen to adult female range",
    characterTypes: ["Female", "Teen Female", "Young Female", "Adult Female", "Female Young", "Teen Girl", "Young Woman", "Concerned Mother", "Adult Female Calm"]
  },
  {
    name: "Adam",
    id: "pNInz6obpgDQGcFmaJgB",
    description: "Young male voice - agitated teens, young men, energetic",
    characterTypes: ["Young Male Agitated", "Teen Male", "Young Male", "Teen Boy", "Agitated Teen", "Young Man", "Teen Male Agitated", "Energetic Young Male"]
  },
  {
    name: "Domi",
    id: "AZnzlk1XvdvUeBnXmlld",
    description: "Scared/frightened female voice - whispered, panicked, crying",
    characterTypes: ["Woman Scared", "Teen Woman", "Frightened Adult", "Female Crying", "Frightened Female", "Scared Woman", "Panicked Female", "Whispering Female", "Crying Woman", "Frightened Woman"]
  },
  {
    name: "Antoni",
    id: "pqHfZKP75CvOlQylNhV4",
    description: "Professional older male voice - authoritative, experienced, EMT/emergency professional",
    characterTypes: ["Professional Older Male", "Male Professional", "Adult Male", "EMT Male", "Emergency Professional", "Authoritative Male", "Experienced Male"]
  },
  {
    name: "Bella",
    id: "EXAVITQu4vr4xnSDxMaL",
    description: "Calm female voice for neutral/professional scenarios",
    characterTypes: ["Neutral Female", "Professional Female", "Calm Female", "Adult Female Professional"]
  },
  {
    name: "Charlie",
    id: "IKne3meq5aSn9XLyUdCD",
    description: "Male voice for urgent/panicked scenarios",
    characterTypes: ["Panicked Male", "Urgent Male", "Male Yelling", "Male Panic", "Breathless Male"]
  }
];

// Helper to get voice ID by name
export function getVoiceIdByName(name: string): string | undefined {
  return voiceDatabase.find(v => v.name === name)?.id;
}

// Helper to get voice name by ID
export function getVoiceNameById(id: string): string | undefined {
  return voiceDatabase.find(v => v.id === id)?.name;
}

// Helper to get voice by character type (for advanced matching)
export function getVoiceByCharacterType(characterType: string): VoiceEntry | undefined {
  return voiceDatabase.find(v => v.characterTypes.includes(characterType));
}

// Helper to get voice description
export function getVoiceDescription(name: string): string | undefined {
  return voiceDatabase.find(v => v.name === name)?.description;
}

// Enhanced voice matching that tries multiple strategies
export function getBestVoiceForCharacter(characterDescription: string): VoiceEntry {
  // First try exact character type match
  const exactMatch = getVoiceByCharacterType(characterDescription);
  if (exactMatch) return exactMatch;

  // Try partial matches based on keywords
  const description = characterDescription.toLowerCase();

  // Female voices
  if (description.includes('female') || description.includes('woman') || description.includes('girl') || description.includes('mother')) {
    if (description.includes('scared') || description.includes('frightened') || description.includes('crying') || description.includes('panicked')) {
      return voiceDatabase.find(v => v.name === 'Domi') || voiceDatabase[0];
    }
    if (description.includes('elderly') || description.includes('older') || description.includes('agitated')) {
      return voiceDatabase.find(v => v.name === 'Rachel') || voiceDatabase[0];
    }
    if (description.includes('teen') || description.includes('young')) {
      return voiceDatabase.find(v => v.name === 'Elli') || voiceDatabase[0];
    }
    return voiceDatabase.find(v => v.name === 'Rachel') || voiceDatabase[0];
  }

  // Male voices
  if (description.includes('male') || description.includes('man') || description.includes('boy') || description.includes('father')) {
    if (description.includes('professional') || description.includes('manager') || description.includes('operator') || description.includes('emt')) {
      return voiceDatabase.find(v => v.name === 'Antoni') || voiceDatabase[0];
    }
    if (description.includes('older') || description.includes('elderly') || description.includes('worried') || description.includes('anxious')) {
      return voiceDatabase.find(v => v.name === 'Arnold') || voiceDatabase[0];
    }
    if (description.includes('teen') || description.includes('young') || description.includes('agitated')) {
      return voiceDatabase.find(v => v.name === 'Adam') || voiceDatabase[0];
    }
    if (description.includes('confident') || description.includes('professional')) {
      return voiceDatabase.find(v => v.name === 'Josh') || voiceDatabase[0];
    }
    if (description.includes('panicked') || description.includes('urgent') || description.includes('yelling')) {
      return voiceDatabase.find(v => v.name === 'Charlie') || voiceDatabase[0];
    }
    return voiceDatabase.find(v => v.name === 'Josh') || voiceDatabase[0];
  }

  // Default fallback
  return voiceDatabase[0];
} 