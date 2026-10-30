import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { MobileVitalsReading, calculateLocalMews, deviceVitals } from "../services/vitals";
import { VitalsTrendChart } from "../components/VitalsTrendChart";

interface Props {
  patientToken: string;
  patientName: string;
  onBack: () => void;
  onEmergencyTrigger: (reason: string) => Promise<void>;
}

export const VitalsScreen: React.FC<Props> = ({
  patientToken,
  patientName,
  onBack,
  onEmergencyTrigger,
}) => {
  const [systolic, setSystolic] = useState<number>(120);
  const [diastolic, setDiastolic] = useState<number>(80);
  const [heartRate, setHeartRate] = useState<number>(75);
  const [spo2, setSpo2] = useState<number>(98);
  const [temp, setTemp] = useState<number>(98.6);
  const [tempUnit, setTempUnit] = useState<"C" | "F">("F");
  const [respiratoryRate, setRespiratoryRate] = useState<number>(16);
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [history, setHistory] = useState<MobileVitalsReading[]>(deviceVitals.getHistory());
  const [lastSaved, setLastSaved] = useState<MobileVitalsReading | null>(null);

  const preview = calculateLocalMews({
    systolic_bp: systolic,
    diastolic_bp: diastolic,
    heart_rate: heartRate,
    respiratory_rate: respiratoryRate,
    temperature: temp,
    temperature_unit: tempUnit,
    spo2: spo2,
    consciousness: "Alert",
  });

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "critical":
        return "#EF4444";
      case "medium_high":
        return "#F97316";
      case "low_medium":
        return "#EAB308";
      default:
        return "#10B981";
    }
  };

  const getRiskLabel = (risk: string, score: number) => {
    switch (risk) {
      case "normal":
        return `Stable / Normal (Score: ${score})`;
      case "low_medium":
        return `Mild Derangement (Score: ${score})`;
      case "medium_high":
        return `Elevated Risk (Score: ${score})`;
      case "critical":
        return `CRITICAL ALERT (Score: ${score})`;
      default:
        return `Score: ${score}`;
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const record = await deviceVitals.recordVitals(patientToken, {
        systolic_bp: systolic,
        diastolic_bp: diastolic,
        heart_rate: heartRate,
        respiratory_rate: respiratoryRate,
        temperature: temp,
        temperature_unit: tempUnit,
        spo2: spo2,
        consciousness: "Alert",
        notes,
      });
      setLastSaved(record);
      setHistory(deviceVitals.getHistory());

      if (record.risk_level === "critical") {
        await onEmergencyTrigger(`Abnormal Vitals Deterioration (MEWS=${record.mews_score})`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.8} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vitals & Early Warning Score</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* MEWS Risk Indicator Banner */}
        <View style={[styles.mewsBanner, { borderColor: getRiskColor(preview.risk) }]}>
          <View>
            <Text style={styles.mewsLabel}>Current MEWS Risk Level</Text>
            <Text style={[styles.mewsValue, { color: getRiskColor(preview.risk) }]}>
              {getRiskLabel(preview.risk, preview.score)}
            </Text>
          </View>
          <View style={[styles.mewsScore, { backgroundColor: getRiskColor(preview.risk) }]}>
            <Text style={styles.mewsScoreText}>{preview.score}</Text>
          </View>
        </View>

        {/* Vitals Trend Chart */}
        <VitalsTrendChart readings={history} />

        {/* Vitals Input Card */}
        <View style={styles.card}>
          {/* Blood Pressure & Heart Rate row */}
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Blood Pressure (mmHg)</Text>
              <View style={styles.bpRow}>
                <TextInput
                  value={String(systolic)}
                  onChangeText={(t) => setSystolic(Number(t) || 0)}
                  keyboardType="numeric"
                  placeholder="Sys"
                  style={[styles.textInput, styles.bpInput]}
                />
                <TextInput
                  value={String(diastolic)}
                  onChangeText={(t) => setDiastolic(Number(t) || 0)}
                  keyboardType="numeric"
                  placeholder="Dia"
                  style={[styles.textInput, styles.bpInput]}
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Heart Rate (bpm)</Text>
              <TextInput
                value={String(heartRate)}
                onChangeText={(t) => setHeartRate(Number(t) || 0)}
                keyboardType="numeric"
                style={styles.textInput}
              />
            </View>
          </View>

          {/* SpO2 & Temperature row */}
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Oxygen SpO2 (%)</Text>
              <TextInput
                value={String(spo2)}
                onChangeText={(t) => setSpo2(Number(t) || 0)}
                keyboardType="numeric"
                style={styles.textInput}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Temperature ({tempUnit})</Text>
              <TextInput
                value={String(temp)}
                onChangeText={(t) => setTemp(Number(t) || 0)}
                keyboardType="decimal-pad"
                style={styles.textInput}
              />
            </View>
          </View>

          {/* Temp Unit Toggle */}
          <View style={styles.tempUnitRow}>
            {(["F", "C"] as const).map((unit) => (
              <TouchableOpacity
                key={unit}
                onPress={() => setTempUnit(unit)}
                activeOpacity={0.8}
                style={[styles.unitChip, tempUnit === unit && styles.unitChipSelected]}
              >
                <Text style={[styles.unitChipText, tempUnit === unit && styles.unitChipTextSelected]}>
                  °{unit}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>Save Vitals Reading</Text>
            )}
          </TouchableOpacity>

          {lastSaved && (
            <View style={styles.savedBanner}>
              <Text style={styles.savedBannerText}>
                ✓ Vitals recorded and synced with care team.
              </Text>
            </View>
          )}
        </View>

        {/* History Timeline */}
        {history.length > 0 && (
          <View>
            <Text style={styles.historyTitle}>Past Readings ({history.length})</Text>
            {history.slice(0, 3).map((h, i) => (
              <View key={i} style={styles.historyCard}>
                <Text style={styles.historyLeft}>
                  <Text style={{ fontWeight: "bold" }}>
                    BP {h.systolic_bp}/{h.diastolic_bp || "-"}
                  </Text>
                  {" · "}HR {h.heart_rate} · SpO2 {h.spo2}%
                </Text>
                <Text
                  style={[
                    styles.historyMews,
                    { color: getRiskColor(h.risk_level || "normal") },
                  ]}
                >
                  MEWS {h.mews_score ?? 0}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    marginRight: 12,
  },
  backArrow: {
    fontSize: 22,
    color: "#0F172A",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0F172A",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  mewsBanner: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mewsLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  mewsValue: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 2,
  },
  mewsScore: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  mewsScoreText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 18,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#475569",
    marginBottom: 4,
  },
  textInput: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    fontSize: 13,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
    marginTop: 4,
  },
  bpRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  bpInput: {
    flex: 1,
    marginTop: 0,
  },
  tempUnitRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  unitChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },
  unitChipSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  unitChipText: {
    fontSize: 13,
    color: "#475569",
  },
  unitChipTextSelected: {
    color: "#1E40AF",
    fontWeight: "bold",
  },
  submitBtn: {
    backgroundColor: "#2563EB",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 14,
  },
  savedBanner: {
    marginTop: 12,
    padding: 8,
    backgroundColor: "#ECFDF5",
    borderRadius: 6,
    alignItems: "center",
  },
  savedBannerText: {
    color: "#065F46",
    fontSize: 12,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1E293B",
    marginBottom: 8,
  },
  historyCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  historyLeft: {
    fontSize: 12,
    color: "#334155",
  },
  historyMews: {
    fontSize: 12,
    fontWeight: "bold",
  },
});
