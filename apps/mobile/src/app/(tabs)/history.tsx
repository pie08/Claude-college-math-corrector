import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { proseText } from '@/features/grading/latexText';
import { formatWhen } from '@/features/history/format';
import { deleteScan, listScans, type ScanSummary } from '@/features/history/repository';
import { radius, spacing, useAppTheme } from '@/theme';

/** Every graded page, newest first. Tap to reopen with its marks; long-press to delete. */
export default function HistoryScreen() {
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const [scans, setScans] = useState<ScanSummary[] | null>(null);

  const load = useCallback(() => {
    listScans(db).then(setScans);
  }, [db]);
  // Reload whenever the tab is shown, so new scans appear.
  useFocusEffect(load);

  function confirmDelete(scan: ScanSummary) {
    Alert.alert('Delete this scan?', 'The photo and its corrections are removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteScan(db, scan.id).then(load) },
    ]);
  }

  if (scans && scans.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState
          icon="time-outline"
          title="No scans yet"
          body="Pages you check are saved on this phone, so you can reopen them later with their red marks and corrections."
        />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      data={scans ?? []}
      keyExtractor={(s) => s.id}
      renderItem={({ item }) => (
        <ScanRow scan={item} onPress={() => router.push({ pathname: '/scan/results/[id]', params: { id: item.id } })} onLongPress={() => confirmDelete(item)} />
      )}
      ListFooterComponent={
        scans && scans.length > 0 ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>Long-press a scan to delete it.</Text>
        ) : null
      }
    />
  );
}

function ScanRow({ scan, onPress, onLongPress }: { scan: ScanSummary; onPress: () => void; onLongPress: () => void }) {
  const { colors } = useAppTheme();
  const status =
    scan.pageStatus !== 'ok'
      ? { icon: 'camera-reverse-outline' as const, color: colors.unclear, text: "Couldn't read" }
      : scan.mistakes > 0
        ? { icon: 'close-circle' as const, color: colors.error, text: `${scan.mistakes} ${scan.mistakes === 1 ? 'mistake' : 'mistakes'}` }
        : scan.unclear > 0
          ? { icon: 'help-circle' as const, color: colors.unclear, text: `${scan.unclear} hard to read` }
          : { icon: 'checkmark-circle' as const, color: colors.success, text: 'No errors' };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`Scan from ${formatWhen(scan.createdAt)}: ${status.text}`}
      accessibilityHint="Opens the page with its marks. Long-press to delete."
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Image source={{ uri: scan.imageUri }} style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} />
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <Text style={[styles.when, { color: colors.text }]}>{formatWhen(scan.createdAt)}</Text>
          <View style={styles.status}>
            <Ionicons name={status.icon} size={16} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
          </View>
        </View>
        <Text style={[styles.summary, { color: colors.textMuted }]} numberOfLines={2}>
          {proseText(scan.summary)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 64,
    height: 84,
    borderRadius: radius.sm,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  when: {
    fontSize: 15,
    fontWeight: '600',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  summary: {
    fontSize: 14,
    lineHeight: 19,
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
