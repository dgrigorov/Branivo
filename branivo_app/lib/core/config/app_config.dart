/// Tenant-configurable app-level constants.
///
/// TODO(white-label): Replace [brandName] with a live lookup from
/// TenantConfigBloc once the tenant-branding endpoint is integrated in Flutter.
class AppConfig {
  const AppConfig._();

  /// The display name shown in the app topbar and branded surfaces.
  /// Overridden per tenant at build time via `--dart-define=BRAND_NAME=...`
  /// or, in the future, loaded from TenantConfigBloc.
  static const String brandName =
      String.fromEnvironment('BRAND_NAME', defaultValue: 'Branivo');
}
