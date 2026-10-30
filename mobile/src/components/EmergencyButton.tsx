import React, { useState } from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from "react-native";

interface Props {
  onTrigger: (heardReason: string) => Promise<void>;
  patientName?: string;
}

export const EmergencyButton: React.FC<Props> = ({ onTrigger, patientName }) => {
  const [triggering, setTriggering] = useState(false);
  const [dispatched, setDispatched] = useState(false);

  const handlePress = async () => {
    setTriggering(true);
    try {
      await onTrigger("Emergency distress button pressed by patient on mobile app");
      setDispatched(true);
      setTimeout(() => setDispatched(false), 8000);
    } catch (err) {
      console.error("Emergency button error:", err);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={triggering}
      activeOpacity={0.8}
      style={[
        styles.button,
        dispatched ? styles.dispatched : styles.emergency,
      ]}
    >
      {triggering ? (
        <ActivityIndicator color="#FFFFFF" size="small" style={styles.icon} />
      ) : (
        <Text style={styles.icon}>{dispatched ? "✅" : "🆘"}</Text>
      )}
      <Text style={styles.label}>
        {dispatched
          ? "Alert Sent! Nurse Is Contacting You..."
          : triggering
          ? "Contacting Care Team..."
          : "Emergency Help / आपातकालीन मदद"}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: "100%",
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  emergency: {
    backgroundColor: "#DC2626",
  },
  dispatched: {
    backgroundColor: "#16A34A",
  },
  icon: {
    fontSize: 24,
    marginRight: 10,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
    flexShrink: 1,
  },
});
