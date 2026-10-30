import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from "react-native";

interface Props {
  onBack: () => void;
}

export const PrivacyPolicyScreen: React.FC<Props> = ({ onBack }) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Privacy Policy & Data Safety</Text>
          <Text style={styles.headerSubtitle}>Google Play Health & Personal Health Data Compliance</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Trust Badge */}
        <View style={styles.badge}>
          <Text style={styles.badgeIcon}>🛡️</Text>
          <View style={styles.badgeText}>
            <Text style={styles.badgeTitle}>ABDM & DISHA Compliant Health App</Text>
            <Text style={styles.badgeSubtitle}>
              Your health data is protected under Indian digital health standards & Google Play Health policies.
            </Text>
          </View>
        </View>

        {/* Section 1 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Zero Cloud Audio Retention Guarantee</Text>
          <Text style={styles.sectionBody}>
            When Background Voice Safety is enabled, ambient audio is analyzed entirely in-memory (volatile RAM) for emergency phrases ("help me", "बचाओ", "cannot breathe").
            {"\n\n"}
            • Audio data is NEVER written to local storage.
            {"\n"}
            • Audio data is NEVER uploaded to cloud servers.
            {"\n"}
            • Only the detected distress event (text snippet + timestamp) is securely transmitted to your hospital care team.
          </Text>
        </View>

        {/* Section 2 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Health & Medication Data Usage</Text>
          <Text style={styles.sectionBody}>
            We collect and process the following health data solely to deliver recovery support:
            {"\n\n"}
            • Prescribed medications, doses, and schedules from your hospital discharge summary.
            {"\n"}
            • Recorded dose confirmations ("Taken" / "Snoozed").
            {"\n"}
            • Vital signs readings you log voluntarily (BP, Heart Rate, SpO2, Temperature).
            {"\n"}
            • Daily recovery mood and wellness check-ins.
            {"\n\n"}
            We DO NOT sell, rent, or share your personal health information with third-party advertisers or data brokers under any circumstances.
          </Text>
        </View>

        {/* Section 3 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Right to Data Erasure (GDPR / DPDP Act)</Text>
          <Text style={styles.sectionBody}>
            You have full ownership of your data. You may permanently erase all clinical records, medication histories, and account credentials at any time from App Settings → "Erase Clinical Data".
          </Text>
        </View>

        {/* Section 4 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Contact Health Data Protection Officer</Text>
          <Text style={styles.sectionBody}>
            For questions or requests regarding your personal health information:
            {"\n"}
            Email: privacy@recoverright.health
            {"\n"}
            Hospital Clinical Governance Board, RecoverRight Health Network
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  backBtn: { marginRight: 10, padding: 4 },
  backBtnText: { fontSize: 22, color: "#2563EB" },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: "bold", color: "#0F172A" },
  headerSubtitle: { fontSize: 11, color: "#64748B" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  badge: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  badgeIcon: { fontSize: 28, marginRight: 12 },
  badgeText: { flex: 1 },
  badgeTitle: { fontSize: 13, fontWeight: "bold", color: "#1E40AF" },
  badgeSubtitle: { fontSize: 11, color: "#64748B", marginTop: 2, lineHeight: 16 },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionTitle: { fontSize: 14, fontWeight: "bold", color: "#1E293B", marginBottom: 8 },
  sectionBody: { fontSize: 13, color: "#475569", lineHeight: 20 },
});
