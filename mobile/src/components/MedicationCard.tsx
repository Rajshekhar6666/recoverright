import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { MedicationSchedule } from "../api/types";
import { loadPersonaPreference } from "../services/voicePersona";

interface Props {
  medication: MedicationSchedule;
  onTakeDose: (medId: string) => Promise<void>;
  onSnoozeDose: (medId: string) => Promise<void>;
}

export const MedicationCard: React.FC<Props> = ({ medication, onTakeDose, onSnoozeDose }) => {
  const [loading, setLoading] = useState(false);
  const isTaken = medication.status === "taken";

  const handleTake = async () => {
    setLoading(true);
    try {
      await onTakeDose(medication.medication_id);
    } finally {
      setLoading(false);
    }
  };

  const handleSnooze = async () => {
    setLoading(true);
    try {
      await onSnoozeDose(medication.medication_id);
    } finally {
      setLoading(false);
    }
  };

  const times = medication.confirmed_times || medication.times || [];
  const personaId = loadPersonaPreference();

  const getTakeButtonLabel = () => {
    switch (personaId) {
      case "caring_maa": return "माँ कह रही हैं: दवा ले ली ✓";
      case "friendly_bhai": return "Done bhai! दवा ले ली ✓";
      case "soothing_didi": return "दीदी की याद: दवा ले ली ✓";
      case "steady_doctor": return "Confirm Dose Taken ✓";
      case "mature_elder": return "दादाजी की सीख: दवा ले ली ✓";
      case "calm_guru": return "स्वास्थ्य संकल्प पूर्ण ✓";
      default: return "Take Now ✓";
    }
  };

  return (
    <View style={[styles.card, isTaken && styles.cardTaken]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.medName}>{medication.name}</Text>
          <Text style={styles.medDose}>
            {medication.dose} · {medication.frequency}
          </Text>
        </View>
        {isTaken && (
          <View style={styles.takenBadge}>
            <Text style={styles.takenBadgeText}>✓ Taken</Text>
          </View>
        )}
      </View>

      {times.length > 0 && (
        <View style={styles.timesRow}>
          {times.map((t, idx) => (
            <View key={idx} style={styles.timePill}>
              <Text style={styles.timePillText}>⏰ {t}</Text>
            </View>
          ))}
        </View>
      )}

      {medication.instructions ? (
        <Text style={styles.instructions}>"{medication.instructions}"</Text>
      ) : null}

      {!isTaken && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={handleTake}
            disabled={loading}
            activeOpacity={0.8}
            style={styles.takeButton}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.takeButtonText}>{getTakeButtonLabel()}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSnooze}
            disabled={loading}
            activeOpacity={0.8}
            style={styles.snoozeButton}
          >
            <Text style={styles.snoozeButtonText}>Snooze 10m</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardTaken: {
    borderColor: "#BBF7D0",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  medName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
    marginBottom: 2,
  },
  medDose: {
    fontSize: 13,
    color: "#64748B",
  },
  takenBadge: {
    backgroundColor: "#DCFCE7",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  takenBadgeText: {
    color: "#15803D",
    fontSize: 12,
    fontWeight: "600",
  },
  timesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  timePill: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  timePillText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },
  instructions: {
    fontSize: 13,
    color: "#475569",
    fontStyle: "italic",
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: "row",
  },
  takeButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: "#2563EB",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  takeButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  snoozeButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  snoozeButtonText: {
    color: "#475569",
    fontWeight: "500",
    fontSize: 14,
  },
});
