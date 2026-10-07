/**
 * Two installs side by side on one phone:
 * - dev (default): the development build that loads code from Metro.
 * - production (APP_VARIANT=production): the standalone app with the
 *   JavaScript bundled in, for everyday use away from the computer.
 * They differ in app ID, name and link scheme, so each keeps its own saved
 * history.
 */
const production = process.env.APP_VARIANT === 'production';

module.exports = ({ config }) => ({
  ...config,
  name: production ? 'Calculus Tutor' : 'Calculus Tutor (dev)',
  scheme: production ? 'calculustutor' : 'calculustutor-dev',
  ios: {
    ...config.ios,
    bundleIdentifier: production ? 'com.example.calculustutor.app' : 'com.example.calculustutor',
  },
  android: {
    ...config.android,
    package: production ? 'com.example.calculustutor.app' : 'com.example.calculustutor',
  },
});
