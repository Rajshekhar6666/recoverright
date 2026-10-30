import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";

const { SpeechRecognizerModule } = NativeModules;

export interface SpeechEventHandlers {
  onStart?: () => void;
  onResults?: (results: string[]) => void;
  onPartialResults?: (results: string[]) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

class NativeSpeechService {
  private emitter: NativeEventEmitter | null = null;
  private subscriptions: Array<{ remove: () => void }> = [];
  private isListening: boolean = false;

  constructor() {
    if (Platform.OS === "android" && SpeechRecognizerModule) {
      this.emitter = new NativeEventEmitter(SpeechRecognizerModule);
    }
  }

  public isAvailable(): boolean {
    return Platform.OS === "android" && !!SpeechRecognizerModule;
  }

  public async startListening(language: "en" | "hi", handlers: SpeechEventHandlers): Promise<boolean> {
    this.stopListening();

    if (Platform.OS === "android") {
      try {
        const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (!hasPermission) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: "Microphone Access Required",
              message: "RecoverRight needs microphone access to listen to your voice commands and distress safety alerts.",
              buttonPositive: "Allow",
              buttonNegative: "Deny",
            }
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            handlers.onError?.("Microphone permission denied. Enable microphone in device settings.");
            return false;
          }
        }
      } catch (err: any) {
        console.warn("[NativeSpeech] Permission check failed:", err);
      }
    }

    if (!this.isAvailable() || !this.emitter) {
      console.log("[NativeSpeech] Native module unavailable, running in simulated mode");
      this.isListening = true;
      handlers.onStart?.();
      return false;
    }

    try {
      this.subscriptions.push(
        this.emitter.addListener("onSpeechStart", () => handlers.onStart?.()),
        this.emitter.addListener("onSpeechResults", (results: string[]) => {
          this.isListening = false;
          handlers.onResults?.(results);
        }),
        this.emitter.addListener("onSpeechPartialResults", (results: string[]) => {
          handlers.onPartialResults?.(results);
        }),
        this.emitter.addListener("onSpeechError", (err: string) => {
          this.isListening = false;
          handlers.onError?.(err);
        }),
        this.emitter.addListener("onSpeechEnd", () => {
          this.isListening = false;
          handlers.onEnd?.();
        })
      );

      await SpeechRecognizerModule.startListening(language);
      this.isListening = true;
      return true;
    } catch (err: any) {
      this.isListening = false;
      handlers.onError?.(err?.message || "Failed to start speech recognition");
      return false;
    }
  }

  public async stopListening(): Promise<void> {
    this.isListening = false;
    this.subscriptions.forEach((s) => {
      try {
        s.remove();
      } catch (_) {}
    });
    this.subscriptions = [];

    if (this.isAvailable() && SpeechRecognizerModule?.stopListening) {
      try {
        await SpeechRecognizerModule.stopListening();
      } catch (_) {}
    }
  }

  public getIsListening(): boolean {
    return this.isListening;
  }
}

export const nativeSpeech = new NativeSpeechService();
