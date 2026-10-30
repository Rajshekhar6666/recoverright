import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SyncStatus } from "../api/types";

interface Props {
  status: SyncStatus;
}

export const LiveStatusBadge: React.FC<Props> = ({ status }) => {
  const isLive = status.server_reachable && status.online;
  const hasQueue = status.pending_offline_actions > 0;

  return (
    <View style={[styles.badge, isLive ? styles.badgeLive : styles.badgeOffline]}>
      <View style={[styles.dot, isLive ? styles.dotLive : styles.dotOffline]} />
      <Text style={[styles.label, isLive ? styles.labelLive : styles.labelOffline]}>
        {isLive ? "Hospital Connected" : "Offline Mode"}
        {hasQueue ? ` · ${status.pending_offline_actions} queued` : ""}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeLive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  badgeOffline: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotLive: {
    backgroundColor: "#10B981",
  },
  dotOffline: {
    backgroundColor: "#F59E0B",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
  labelLive: {
    color: "#065F46",
  },
  labelOffline: {
    color: "#92400E",
  },
});
