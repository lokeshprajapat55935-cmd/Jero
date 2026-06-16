import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  SafeAreaView,
} from 'react-native';
import { auth } from '../../src/firebase';
import { signInWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';

const OTPLoginScreen = ({ navigation }) => {
  // States
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState('SEND'); // 'SEND' | 'VERIFY'
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);

  // Refs
  const [confirmationResult, setConfirmationResult] = useState(null);

  // Timer for resend OTP
  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    if (!window.recaptchaVerifier && Platform.OS === 'web') {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });
    }
    return () => {
      if (window.recaptchaVerifier && Platform.OS === 'web') {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = undefined;
      }
    };
  }, []);

  /**
   * Step A: Send OTP
   */
  const handleSendOTP = async () => {
    if (phoneNumber.length !== 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit Indian phone number.');
      return;
    }

    setLoading(true);
    try {
      const e164Phone = `+91${phoneNumber}`;
      // In a real native app, you'd use @react-native-firebase/auth without RecaptchaVerifier.
      // This implementation supports web/expo environments.
      const appVerifier = window.recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(auth, e164Phone, appVerifier);
      setConfirmationResult(confirmation);
      
      setStep('VERIFY');
      setTimer(30); // 30 seconds wait for resend
    } catch (error) {
      console.error('Send OTP Error:', error);
      Alert.alert('Network Error', error.message || 'Could not connect to service. Please check your internet.');
      if (window.recaptchaVerifier && Platform.OS === 'web') {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Step B: Verify OTP
   */
  const handleVerifyOTP = async () => {
    if (otpCode.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit code sent to your phone.');
      return;
    }

    if (!confirmationResult) {
      Alert.alert('Error', 'Please request OTP first.');
      return;
    }

    setLoading(true);
    try {
      const result = await confirmationResult.confirm(otpCode);
      const firebaseToken = await result.user.getIdToken();
      
      // Navigate or handle session (exchange token with backend if needed)
      console.log('Verification Success for UID:', result.user.uid);
      Alert.alert('Success', 'Login successful!', [
        { text: 'OK', onPress: () => navigation?.replace('Home') }
      ]);
    } catch (error) {
      console.error('Verify OTP Error:', error);
      Alert.alert('Verification Failed', 'The OTP you entered is incorrect or expired.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = () => {
    if (timer === 0) {
      handleSendOTP();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <div id="recaptcha-container"></div>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to Zolvo</Text>
          <Text style={styles.subtitle}>
            {step === 'SEND' 
              ? 'Enter your phone number to continue' 
              : `Enter the 6-digit code sent to +91 ${phoneNumber}`}
          </Text>
        </View>

        <View style={styles.form}>
          {step === 'SEND' ? (
            <View style={styles.inputContainer}>
              <Text style={styles.countryCode}>+91</Text>
              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                keyboardType="phone-pad"
                maxLength={10}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                editable={!loading}
              />
            </View>
          ) : (
            <View style={styles.otpInputContainer}>
              <TextInput
                style={styles.otpInput}
                placeholder="• • • • • •"
                keyboardType="number-pad"
                maxLength={6}
                value={otpCode}
                onChangeText={setOtpCode}
                editable={!loading}
                autoFocus={true}
              />
              <TouchableOpacity 
                onPress={handleResendOTP} 
                disabled={timer > 0 || loading}
                style={styles.resendButton}
              >
                <Text style={[styles.resendText, timer > 0 && styles.resendDisabled]}>
                  {timer > 0 ? `Resend OTP in ${timer}s` : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={step === 'SEND' ? handleSendOTP : handleVerifyOTP}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>
                {step === 'SEND' ? 'Send OTP' : 'Verify & Login'}
              </Text>
            )}
          </TouchableOpacity>

          {step === 'VERIFY' && (
            <TouchableOpacity 
              onPress={() => setStep('SEND')} 
              style={styles.backButton}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>Change Phone Number</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    lineHeight: 24,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 24,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginRight: 12,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
    paddingRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
  },
  otpInputContainer: {
    marginBottom: 24,
  },
  otpInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    height: 64,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    color: '#1A1A1A',
    marginBottom: 16,
  },
  resendButton: {
    alignItems: 'center',
  },
  resendText: {
    color: '#14826f', // Zolvo theme color
    fontWeight: '600',
    fontSize: 14,
  },
  resendDisabled: {
    color: '#999999',
  },
  button: {
    backgroundColor: '#14826f', // Zolvo theme color
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#14826f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#A0D1C8',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#666666',
    fontSize: 14,
  },
});

export default OTPLoginScreen;
