import { Setting } from "@edge/db";
import { parseSetting, SETTINGS, type SettingKey, type SettingValue } from "@edge/domain/settings/schema";

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await Setting.findById(key).lean();
  return row ? parseSetting(key, row.value) : (SETTINGS[key].default as SettingValue<K>);
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>, updatedById?: string | null) {
  const parsed = SETTINGS[key].schema.parse(value);
  await Setting.updateOne({ _id: key }, { $set: { value: parsed, updatedById: updatedById ?? null } }, { upsert: true });
}
