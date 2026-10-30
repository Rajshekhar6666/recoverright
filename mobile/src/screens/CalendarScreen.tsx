import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { FollowUpAppointment } from "../api/types";
import { deviceCalendar } from "../services/calendar";

interface Props {
  followUps: FollowUpAppointment[];
  patientName: string;
  onBack: () => void;
  onRescheduleRequest: (fieldId: string) => Promise<void>;
}

export const CalendarScreen: React.FC<Props> = ({
  followUps,
  patientName,
  onBack,
  onRescheduleRequest,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await deviceCalendar.syncFollowUps(followUps, "City Hospital Clinic", patientName);
      setSyncedCount(res.synced);
    } catch (err) {
      console.error("Calendar sync error:", err);
    } finally {
      setSyncing(false);
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
        <View>
          <Text style={styles.headerTitle}>📅 Clinical Calendar Sync</Text>
          <Text style={styles.headerSubtitle}>Add visits to your Apple or Google Calendar</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Sync Button */}
        <TouchableOpacity
          onPress={handleSyncAll}
          disabled={syncing}
          activeOpacity={0.8}
          style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
        >
          {syncing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.syncBtnText}>
              {syncedCount !== null
                ? `✓ ${syncedCount} Visits Synced to Calendar`
                : "Sync All Appointments to Calendar"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Appointment Cards */}
        {followUps.map((fu) => (
          <View key={fu.field_id} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.cardLeft}>
                <Text style={styles.cardTitle}>{fu.what}</Text>
                <Text style={styles.cardWhen}>🗓️ {fu.when}</Text>
                <Text style={styles.cardWhere}>📍 {fu.where}</Text>
              </View>
              {fu.synced_to_calendar && (
                <Text style={styles.syncedBadge}>✓ Synced</Text>
              )}
            </View>

            <View style={styles.cardFooter}>
              <TouchableOpacity
                onPress={() => onRescheduleRequest(fu.field_id)}
                activeOpacity={0.8}
                style={styles.rescheduleBtn}
              >
                <Text style={styles.rescheduleBtnText}>Request Reschedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
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
    fontSize: 24,
    color: "#2563EB",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0F172A",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  syncBtn: {
    width: "100%",
    padding: 14,
    backgroundColor: "#16A34A",
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  syncBtnDisabled: {
    opacity: 0.7,
  },
  syncBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardLeft: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
    marginBottom: 4,
  },
  cardWhen: {
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "600",
    marginBottom: 4,
  },
  cardWhere: {
    fontSize: 13,
    color: "#64748B",
  },
  syncedBadge: {
    fontSize: 12,
    color: "#16A34A",
    fontWeight: "bold",
  },
  cardFooter: {
    marginTop: 12,
    alignItems: "flex-end",
  },
  rescheduleBtn: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  rescheduleBtnText: {
    fontSize: 12,
    color: "#D97706",
    fontWeight: "600",
  },
});
