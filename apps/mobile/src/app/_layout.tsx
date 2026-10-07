import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAppTheme } from '@/theme';

export default function RootLayout() {
  const theme = useAppTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ThemeProvider value={theme.navigation}>
        <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="scan/crop"
            options={{
              title: 'Crop & rotate',
              // The swipe-back gesture would fight with dragging the left crop edge.
              gestureEnabled: false,
              headerStyle: { backgroundColor: theme.colors.canvas },
              headerTintColor: '#FFFFFF',
            }}
          />
          <Stack.Screen name="scan/review" options={{ title: 'Ready to check' }} />
          <Stack.Screen name="scan/grading" options={{ title: 'Checking', headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen
            name="scan/results/[id]"
            options={{
              title: 'Results',
              // Pinch and pan on the page would fight the swipe-back gesture.
              gestureEnabled: false,
            }}
          />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
