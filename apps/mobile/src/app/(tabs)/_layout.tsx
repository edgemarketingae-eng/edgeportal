import { Tabs } from "expo-router";
import { TabBar } from "@/components/tab-bar";
import { useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, animation: "shift", sceneStyle: { backgroundColor: t.background } }}
    >
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="leads" options={{ title: "Leads" }} />
      <Tabs.Screen name="me" options={{ title: "Me" }} />
    </Tabs>
  );
}
