import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MobileVitalsReading } from "../services/vitals";

interface Props {
  readings: MobileVitalsReading[];
}

export const VitalsTrendChart: React.FC<Props> = ({ readings }) => {
  if (!readings || readings.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Record at least one vitals reading to see your recovery trend chart.
        </Text>
      </View>
    );
  }

  // Show last 7 readings oldest→newest
  const data = [...readings].reverse().slice(-7);
  const latest = data[data.length - 1];

  // Simple bar chart using Views
  const maxHr = Math.max(...data.map((d) => d.heart_rate), 100);
  const maxBp = Math.max(...data.map((d) => d.systolic_bp), 140);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>📈 Vitals Trend (Last {data.length} Readings)</Text>
          <Text style={styles.subtitle}>❤️ HR (Red) vs 🔵 Systolic BP (Blue)</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.hrValue}>HR: {latest.heart_rate}</Text>
          <Text style={styles.bpValue}>BP: {latest.systolic_bp}</Text>
        </View>
      </View>

      {/* Simple bar visualization */}
      <View style={styles.barsContainer}>
        {data.map((d, i) => {
          const hrHeight = Math.max(4, (d.heart_rate / maxHr) * 60);
          const bpHeight = Math.max(4, (d.systolic_bp / maxBp) * 60);
          return (
            <View key={i} style={styles.barGroup}>
              <View style={styles.barsRow}>
                <View style={[styles.bar, styles.barHr, { height: hrHeight }]} />
                <View style={[styles.bar, styles.barBp, { height: bpHeight }]} />
              </View>
              <Text style={styles.barLabel}>{i + 1}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>Earlier</Text>
        <Text style={styles.axisLabel}>Latest</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    padding: 16,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderStyle: "dashed",
    marginBottom: 16,
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 12,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#1E293B",
  },
  subtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  hrValue: {
    color: "#EF4444",
    fontWeight: "bold",
    fontSize: 12,
  },
  bpValue: {
    color: "#3B82F6",
    fontWeight: "bold",
    fontSize: 12,
    marginTop: 2,
  },
  barsContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 70,
    marginBottom: 4,
  },
  barGroup: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  bar: {
    width: 6,
    borderRadius: 3,
  },
  barHr: {
    backgroundColor: "#EF4444",
  },
  barBp: {
    backgroundColor: "#3B82F6",
  },
  barLabel: {
    fontSize: 9,
    color: "#94A3B8",
    marginTop: 2,
  },
  axisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  axisLabel: {
    fontSize: 10,
    color: "#94A3B8",
  },
});
