import { View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { useAppTheme } from '@/theme';

// Populated from local storage in Phase 4.
export default function HistoryScreen() {
  const { colors } = useAppTheme();

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
