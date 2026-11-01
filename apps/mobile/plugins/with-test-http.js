const { withAndroidManifest } = require("expo/config-plugins");

/** Lets a test build talk to a local API over HTTP. Never set for an APK that goes to staff. */
module.exports = function withTestHttp(config) {
  return withAndroidManifest(config, (c) => {
    c.modResults.manifest.application[0].$["android:usesCleartextTraffic"] = "true";
    return c;
  });
};
