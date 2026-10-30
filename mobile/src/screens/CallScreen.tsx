import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { LiveCallState } from "../api/types";
import { patientCallManager } from "../services/calling";

interface Props {
  callState: LiveCallState;
  onHangup: () => void;
  onAcceptIncoming: () => void;
}

export const CallScreen: React.FC<Props> = ({ callState, onHangup, onAcceptIncoming }) => {
  const isRinging = callState.status === "ringing";
  const isConnected = callState.status === "connected";

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <View style={styles.container}>
        {/* Top */}
        <View style={styles.topSection}>
          <View style={styles.appBadge}>
            <Text style={styles.appBadgeText}>RecoverRight · Live Care Call</Text>
          </View>
          <Text style={styles.nurseName}>{callState.nurse_name || "Attending Nurse"}</Text>
          <Text style={styles.nurseRole}>Hospital Recovery Care Team</Text>
          <Text style={styles.callStatus}>
            {isRinging
              ? "🔔 Ringing Hospital Console..."
              : isConnected
              ? `📞 Connected (${formatDuration(callState.duration_seconds)})`
              : "Call Ended"}
          </Text>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, isConnected && styles.avatarConnected]}>
            <Text style={styles.avatarEmoji}>👩‍⚕️</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controlsSection}>
          {isRinging && (
            <TouchableOpacity onPress={onAcceptIncoming} activeOpacity={0.8} style={styles.answerBtn}>
              <Text style={styles.answerBtnText}>📞 Answer Call</Text>
            </TouchableOpacity>
          )}

          <View style={styles.controlsRow}>
            <TouchableOpacity
              onPress={() => patientCallManager.toggleMute()}
              activeOpacity={0.8}
              style={[styles.controlBtn, callState.is_muted && styles.controlBtnMuted]}
            >
              <Text style={styles.controlBtnIcon}>{callState.is_muted ? "🔇" : "🎙️"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => patientCallManager.toggleSpeaker()}
              activeOpacity={0.8}
              style={[styles.controlBtn, callState.is_speaker && styles.controlBtnSpeaker]}
            >
              <Text style={styles.controlBtnIcon}>🔊</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onHangup} activeOpacity={0.8} style={styles.hangupBtn}>
            <Text style={styles.hangupBtnText}>End Call</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0F172A" },
  container: { flex: 1, justifyContent: "space-between", padding: 24 },
  topSection: { alignItems: "center", paddingTop: 16 },
  appBadge: {
    backgroundColor: "#1E293B",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginBottom: 20,
  },
  appBadgeText: { fontSize: 12, color: "#94A3B8", letterSpacing: 1 },
  nurseName: { fontSize: 24, fontWeight: "bold", color: "#F8FAFC", marginBottom: 4 },
  nurseRole: { fontSize: 14, color: "#94A3B8", marginBottom: 16 },
  callStatus: { fontSize: 16, color: "#38BDF8", fontWeight: "600" },
  avatarSection: { alignItems: "center" },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1E293B",
    borderWidth: 3,
    borderColor: "#38BDF8",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarConnected: {
    borderColor: "#10B981",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  avatarEmoji: { fontSize: 52 },
  controlsSection: { paddingBottom: 16 },
  answerBtn: {
    backgroundColor: "#16A34A",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  answerBtnText: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold" },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 20,
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 10,
  },
  controlBtnMuted: { backgroundColor: "#DC2626" },
  controlBtnSpeaker: { backgroundColor: "#2563EB" },
  controlBtnIcon: { fontSize: 22 },
  hangupBtn: {
    backgroundColor: "#DC2626",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  hangupBtnText: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold" },
});
