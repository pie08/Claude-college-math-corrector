import { View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { useAppTheme } from '@/theme';

// Populated from local storage in Phase 4.
export default function CorrectionsScreen() {
  const { colors } = useAppTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <EmptyState
        icon="create-outline"
        title="No corrections yet"
        body="When the tutor finds a mistake in your work, the fix shows up here so you can review it before a test."
      />
    </View>
  );
}
