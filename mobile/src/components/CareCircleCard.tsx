import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";

export interface CareCircleContact {
  label: string;
  value: string;
}

interface Props {
  contacts?: CareCircleContact[];
  onCallContact?: (phone: string) => void;
}

export const CareCircleCard: React.FC<Props> = ({ contacts, onCallContact }) => {
  const displayContacts = contacts && contacts.length > 0
    ? contacts.map(c => ({
        name: c.label || "Caregiver",
        role: "Emergency Contact",
        phone: c.value,
      }))
    : [
        { name: "Sunita Sharma", role: "Family Primary Caregiver", phone: "+91 98765 43210" },
        { name: "Dr. Ananya Rao", role: "Assigned Nurse", phone: "+91 98765 00001" },
      ];

  const handleCall = (phone: string) => {
    if (onCallContact) {
      onCallContact(phone);
    } else {
      Linking.openURL(`tel:${phone}`).catch(() => {});
    }
  };

  const avatarColors = [
    { bg: "#E0E7FF", text: "#3730A3" },
    { bg: "#FEF3C7", text: "#92400E" },
    { bg: "#FCE7F3", text: "#9D174D" },
    { bg: "#D1FAE5", text: "#065F46" },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>🤝 Your Family & Care Circle</Text>
          <Text style={styles.subtitle}>People walking this recovery journey with you</Text>
        </View>
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>● Active Circle</Text>
        </View>
      </View>

      {displayContacts.map((c, i) => {
        const color = avatarColors[i % avatarColors.length];
        return (
          <View key={i} style={styles.contactRow}>
            <View style={styles.contactLeft}>
              <View style={[styles.avatar, { backgroundColor: color.bg }]}>
                <Text style={[styles.avatarText, { color: color.text }]}>
                  {c.name.charAt(0)}
                </Text>
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>
                  {c.name}
                  {i === 0 ? <Text style={styles.onDutyTag}> (On Duty Today)</Text> : null}
                </Text>
                <Text style={styles.contactRole}>{c.role} · {c.phone}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => handleCall(c.phone)}
              activeOpacity={0.8}
              style={styles.callButton}
            >
              <Text style={styles.callButtonText}>📞 Call</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontWeight: "bold",
    fontSize: 14,
    color: "#1E293B",
  },
  subtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: "#DCFCE7",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: 11,
    color: "#166534",
    fontWeight: "bold",
  },
  contactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  contactLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: {
    fontWeight: "bold",
    fontSize: 14,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontWeight: "600",
    fontSize: 13,
    color: "#1E293B",
  },
  onDutyTag: {
    fontSize: 10,
    color: "#059669",
    fontWeight: "normal",
  },
  contactRole: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  callButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  callButtonText: {
    fontSize: 12,
    color: "#1E40AF",
    fontWeight: "bold",
  },
});
