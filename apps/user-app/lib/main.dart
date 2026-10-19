import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core/constants/colors.dart';
import 'core/constants/api_constants.dart';
import 'core/network/api_client.dart';
import 'core/storage/secure_storage_service.dart';
import 'core/services/display_mode_service.dart';
import 'screens/auth/auth_screen.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Force 120 FPS / 120 Hz display refresh rate by default
  await DisplayModeService.force120Hz();

  // Set standard status bar colors
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  final savedUrl = await SecureStorageService.getCustomBaseUrl();
  if (savedUrl != null && savedUrl.isNotEmpty) {
    ApiConstants.setRuntimeUrl(savedUrl);
  }

  ApiClient.init();

  runApp(const MoneyGameUserApp());
}

class MoneyGameUserApp extends StatefulWidget {
  const MoneyGameUserApp({super.key});

  @override
  State<MoneyGameUserApp> createState() => _MoneyGameUserAppState();
}

class _MoneyGameUserAppState extends State<MoneyGameUserApp>
    with WidgetsBindingObserver {
  UserProfileModel? _currentUser;
  bool _initializing = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    DisplayModeService.force120Hz();
    _checkSavedSession();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      DisplayModeService.force120Hz();
    }
  }

  Future<void> _checkSavedSession() async {
    try {
      final savedUrl = await SecureStorageService.getCustomBaseUrl();
      if (savedUrl != null && savedUrl.isNotEmpty) {
        ApiConstants.setRuntimeUrl(savedUrl);
      }
      final token = await SecureStorageService.getAccessToken();
      if (token != null && token.isNotEmpty) {
        final profile = await ApiClient.getMe();
        if (mounted) {
          setState(() {
            _currentUser = profile;
            _initializing = false;
          });
          return;
        }
      }
    } catch (_) {
      await SecureStorageService.clearSession();
    }

    if (mounted) {
      setState(() {
        _currentUser = null;
        _initializing = false;
      });
    }
  }

  void _onAuthSuccess(UserProfileModel user) {
    setState(() {
      _currentUser = user;
    });
  }

  void _onLogout() {
    setState(() {
      _currentUser = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MoneyGame',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: AppColors.slate50,
        colorScheme: const ColorScheme.light(
          primary: AppColors.emerald600,
          onPrimary: AppColors.white,
          secondary: AppColors.slate800,
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
            backgroundColor: AppColors.emerald600,
            foregroundColor: AppColors.white,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            textStyle: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.slate900,
            side: const BorderSide(color: AppColors.slate200),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            textStyle: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
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
              backgroundColor: AppColors.slate50,
              body: Center(
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.emerald600,
                ),
              ),
            )
          : _currentUser != null
              ? HomeScreen(
                  user: _currentUser!,
                  onLogout: _onLogout,
                )
              : AuthScreen(
                  onAuthSuccess: _onAuthSuccess,
                ),
    );
  }
}
