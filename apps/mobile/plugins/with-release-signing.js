const { withAppBuildGradle } = require("expo/config-plugins");

const LOAD_KEY = `def edgeKey = new Properties()
def edgeKeyFile = new File(System.getProperty("user.home"), ".edge-crm/keystore.properties")
if (edgeKeyFile.exists()) edgeKeyFile.withInputStream { edgeKey.load(it) }

android {`;

const SIGNING = `signingConfigs {
        edgeRelease {
            storeFile file(edgeKey["storeFile"] ?: "missing.keystore")
            storePassword edgeKey["storePassword"]
            keyAlias edgeKey["keyAlias"]
            keyPassword edgeKey["keyPassword"]
        }`;

/** Signs release builds with the key kept outside the repo, so every APK installs over the previous one. */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    if (c.modResults.contents.includes("edgeRelease")) return c;
    c.modResults.contents = c.modResults.contents
      .replace(/^android \{/m, LOAD_KEY)
      .replace("signingConfigs {", SIGNING)
      .replace(/(release \{[\s\S]*?)signingConfig signingConfigs\.debug/, "$1signingConfig signingConfigs.edgeRelease");
    return c;
  });
};
