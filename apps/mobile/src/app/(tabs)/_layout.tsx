import { crmRoutes } from "@edge/contracts";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { TabBar } from "@/components/tab-bar";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const MAX_BADGE = 99;

export default function TabsLayout() {
  const t = useTheme();
  const due = useQuery({ queryKey: ["due-count"], queryFn: () => api(crmRoutes.dueCount) }).data?.count ?? 0;
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, animation: "shift", sceneStyle: { backgroundColor: t.background } }}
    >
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="leads" options={{ title: "Leads" }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks", tabBarBadge: due ? (due > MAX_BADGE ? `${MAX_BADGE}+` : due) : undefined }} />
      <Tabs.Screen name="me" options={{ title: "Me" }} />
    </Tabs>
  );
}
