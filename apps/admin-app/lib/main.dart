import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core/constants/colors.dart';
import 'core/constants/api_constants.dart';
import 'core/network/admin_api_client.dart';
import 'core/storage/admin_secure_storage.dart';
import 'screens/auth/admin_login_screen.dart';
import 'screens/admin_home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  final savedUrl = await AdminSecureStorage.getCustomBaseUrl();
  if (savedUrl != null && savedUrl.isNotEmpty) {
    ApiConstants.setRuntimeUrl(savedUrl);
  }

  AdminApiClient.init();

  runApp(const MoneyGameAdminApp());
}

class MoneyGameAdminApp extends StatefulWidget {
  const MoneyGameAdminApp({super.key});

  @override
  State<MoneyGameAdminApp> createState() => _MoneyGameAdminAppState();
}

class _MoneyGameAdminAppState extends State<MoneyGameAdminApp> {
  AdminProfileModel? _currentAdmin;
  bool _initializing = true;

  @override
  void initState() {
    super.initState();
    _checkSavedSession();
  }

  Future<void> _checkSavedSession() async {
    try {
      final token = await AdminSecureStorage.getAccessToken();
      if (token != null && token.isNotEmpty) {
        final profile = await AdminApiClient.getMe();
        if (mounted) {
          setState(() {
            _currentAdmin = profile;
            _initializing = false;
          });
          return;
        }
      }
    } catch (_) {
      await AdminSecureStorage.clearSession();
    }

    if (mounted) {
      setState(() {
        _currentAdmin = null;
        _initializing = false;
      });
    }
  }

  void _onLoginSuccess(AdminProfileModel admin) {
    setState(() {
      _currentAdmin = admin;
    });
  }

  void _onLogout() {
    setState(() {
      _currentAdmin = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MoneyGame Super Admin',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: AppColors.slate50,
        colorScheme: const ColorScheme.light(
          primary: AppColors.slate900,
          onPrimary: AppColors.white,
          secondary: AppColors.emerald600,
          onSecondary: AppColors.white,
          surface: AppColors.white,
          onSurface: AppColors.slate900,
          error: AppColors.red600,
          onError: AppColors.white,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.white,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          iconTheme: IconThemeData(color: AppColors.slate900),
          titleTextStyle: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.slate900,
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.slate900,
            foregroundColor: AppColors.white,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            textStyle: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        cardTheme: CardThemeData(
          color: AppColors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: AppColors.slate200),
          ),
        ),
        dividerTheme: const DividerThemeData(
          color: AppColors.slate200,
          thickness: 1,
          space: 1,
        ),
      ),
      home: _initializing
          ? const Scaffold(
              backgroundColor: AppColors.slate950,
              body: Center(
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.white,
                ),
              ),
            )
          : _currentAdmin != null
              ? AdminHomeScreen(
                  admin: _currentAdmin!,
                  onLogout: _onLogout,
                )
              : AdminLoginScreen(
                  onLoginSuccess: _onLoginSuccess,
                ),
    );
  }
}
