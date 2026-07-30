import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Modal,
  Switch,
  ActivityIndicator,
  Platform
} from 'react-native';
import * as Speech from 'expo-speech';

const SAKARYA = { lat: 40.7569, lon: 30.3781 };

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [voiceMode, setVoiceMode] = useState('browser');
  const [humor, setHumor] = useState(true);
  
  const [clockStr, setClockStr] = useState('--:--');
  const [orbState, setOrbState] = useState('idle'); // 'idle', 'listening', 'awake'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  
  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([
    { role: 'sys', text: 'Jarvis hazır. Önce ayarlardan Gemini API anahtarını gir.' }
  ]);

  const scrollViewRef = useRef();

  // Saat güncellemesi
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const s = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
      setClockStr(s);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sohbet otomatik aşağı kaydırma
  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const addBubble = (role, text) => {
    setMessages((prev) => [...prev, { role, text }]);
  };

  const saveSettings = () => {
    setApiKey(tempApiKey.trim());
    setIsSettingsOpen(false);
    addBubble('sys', tempApiKey.trim() ? "API anahtarı kaydedildi." : "Anahtar boş bırakıldı.");
  };

  const getWeatherContext = async () => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${SAKARYA.lat}&longitude=${SAKARYA.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe/Istanbul`;
      const res = await fetch(url);
      const data = await res.json();
      const c = data.current;
      return `Sakarya güncel hava: sıcaklık ${c.temperature_2m}°C, rüzgar ${c.wind_speed_10m} km/s, hava kodu ${c.weather_code}.`;
    } catch (e) {
      return null;
    }
  };

  const speak = (text) => {
    if (voiceMode === 'gemini') {
      addBubble('sys', 'Gemini native ses modu bu prototipte demo amaçlı — cihaz sesiyle okunuyor.');
    }
    Speech.speak(text, { language: 'tr-TR' });
  };

  const askJarvis = async (query) => {
    if (!apiKey) {
      addBubble('jarvis', 'Önce ayarlardan Gemini API anahtarını girmen lazım.');
      speak('Önce ayarlardan API anahtarını girmen lazım.');
      setOrbState('idle');
      return;
    }

    let extraContext = '';
    if (/hava/i.test(query)) {
      const w = await getWeatherContext();
      if (w) extraContext = w;
    }

    const now = new Date();
    const timeStr = now.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

    const systemPrompt = `Sen kullanıcının kişisel sesli asistanısın, adın Jarvis. Türkçe konuş. Kısa ve öz cevaplar ver (1-3 cümle, gerekmedikçe uzatma). ${humor ? 'Hafif mizahi ve samimi bir üslubun var.' : 'Net ve ciddi bir üslubun var.'} Konum referansı: Türkiye, Sakarya. Şu anki tarih/saat (Europe/Istanbul): ${timeStr}. ${extraContext ? 'Ek bilgi: ' + extraContext : ''} Sohbet geçmişini hatırla ve bağlamı kullan.`;

    const contents = history.slice(-10).map((h) => ({ role: h.role, parts: [{ text: h.text }] }));
    contents.push({ role: 'user', parts: [{ text: query }] });

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message || 'API hatası');

      const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || 'Cevap alınamadı.';
      addBubble('jarvis', reply);
      
      setHistory((prev) => [
        ...prev,
        { role: 'user', text: query },
        { role: 'model', text: reply }
      ]);

      speak(reply);
    } catch (err) {
      addBubble('sys', 'Hata: ' + err.message + ' (API anahtarını kontrol et.)');
    } finally {
      setOrbState('idle');
    }
  };

  const sendTyped = () => {
    let text = inputMessage.trim();
    if (!text) return;
    setInputMessage('');

    const lower = text.toLowerCase();
    const idx = lower.indexOf('jarvis');
    const query = idx !== -1 ? text.slice(idx + 6).replace(/^[,:\s]+/, '') : text;

    addBubble('user', text);
    setOrbState('awake');
    askJarvis(query || text);
  };

  const toggleListening = () => {
    if (orbState === 'listening') {
      setOrbState('idle');
      addBubble('sys', 'Dinleme kapatıldı.');
    } else {
      setOrbState('listening');
      addBubble('sys', 'Dinleme açık. "Jarvis" diyerek yazabilir veya komut verebilirsin.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.phone}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>JARVIS</Text>
            <Text style={styles.sub}>Sakarya · Mobil Uygulama</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setIsSettingsOpen(true)}>
            <Text style={{ color: '#e8eaf0', fontSize: 18 }}>⚙</Text>
          </TouchableOpacity>
        </View>

        {/* Status Row */}
        <View style={styles.statusRow}>
          <Text style={styles.mutedText}>{clockStr}</Text>
          <Text style={styles.mutedText}>
            Motor: <Text style={{ color: apiKey ? '#4dd0e1' : '#ff5c5c' }}>{apiKey ? 'bağlı' : 'bağlı değil'}</Text>
          </Text>
        </View>

        {/* Orb Section */}
        <View style={styles.orbWrap}>
          <View style={[
            styles.orb,
            orbState === 'listening' && styles.orbListening,
            orbState === 'awake' && styles.orbAwake
          ]}>
            <Text style={styles.orbText}>
              {orbState === 'listening' ? 'Dinliyor' : orbState === 'awake' ? 'Jarvis...' : 'Beklemede'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.micToggle, orbState === 'listening' && styles.micToggleOn]}
            onPress={toggleListening}
          >
            <Text style={styles.micToggleText}>
              {orbState === 'listening' ? 'Dinlemeyi Durdur' : 'Dinlemeyi Başlat'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.hint}>"Jarvis" diyip ardından sor. Örn: "Jarvis, Sakarya'da hava nasıl?"</Text>
        </View>

        {/* Chat Bubbles */}
        <ScrollView style={styles.chat} ref={scrollViewRef}>
          {messages.map((item, index) => (
            <View
              key={index}
              style={[
                styles.bubble,
                item.role === 'user' && styles.bubbleUser,
                item.role === 'jarvis' && styles.bubbleJarvis,
                item.role === 'sys' && styles.bubbleSys,
              ]}
            >
              <Text style={[styles.bubbleText, item.role === 'user' && { color: '#ffffff' }]}>
                {item.text}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Input Row */}
        <View style={styles.textRow}>
          <TextInput
            style={styles.textInput}
            placeholder="Jarvis, saat kaç?"
            placeholderTextColor="#8b93a7"
            value={inputMessage}
            onChangeText={setInputMessage}
            onSubmitEditing={sendTyped}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendTyped}>
            <Text style={styles.sendBtnText}>Gönder</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Settings Modal */}
      <Modal visible={isSettingsOpen} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Ayarlar</Text>
            <Text style={styles.modalDesc}>Gemini API anahtarını buradan gir. Ücretsiz anahtar: aistudio.google.com</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Gemini API Anahtarı</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="AIza..."
                placeholderTextColor="#8b93a7"
                secureTextEntry
                value={tempApiKey}
                onChangeText={setTempApiKey}
              />
            </View>

            <View style={styles.checkRow}>
              <Text style={{ color: '#8b93a7', fontSize: 13 }}>Hafif mizahi ton</Text>
              <Switch value={humor} onValueChange={setHumor} trackColor={{ false: '#2a2e38', true: '#4dd0e1' }} />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setIsSettingsOpen(false)}>
                <Text style={{ color: '#e8eaf0', fontWeight: '600' }}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={saveSettings}>
                <Text style={{ color: '#06232a', fontWeight: '600' }}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0f13' },
  phone: { flex: 1, backgroundColor: '#171a21' },
  header: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#2a2e38' },
  title: { fontSize: 17, fontWeight: '600', color: '#e8eaf0', letterSpacing: 0.5 },
  sub: { fontSize: 11, color: '#8b93a7', marginTop: 2 },
  iconBtn: { backgroundColor: '#1f232c', borderWidth: 1, borderColor: '#2a2e38', width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#2a2e38' },
  mutedText: { fontSize: 12, color: '#8b93a7' },
  orbWrap: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10, alignItems: 'center' },
  orb: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#12141a', borderWidth: 2, borderColor: '#2a2e38', alignItems: 'center', justifyContent: 'center' },
  orbListening: { borderColor: '#4dd0e1' },
  orbAwake: { borderColor: '#7c4dff' },
  orbText: { color: '#8b93a7', fontSize: 13 },
  micToggle: { marginTop: 14, width: '100%', padding: 12, borderRadius: 14, backgroundColor: '#4dd0e1', alignItems: 'center' },
  micToggleOn: { backgroundColor: '#ff5c5c' },
  micToggleText: { color: '#06232a', fontWeight: '600', fontSize: 14 },
  hint: { fontSize: 11, color: '#8b93a7', textAlign: 'center', marginTop: 8 },
  chat: { flex: 1, paddingHorizontal: 16, paddingVertical: 10 },
  bubble: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 14, marginBottom: 10 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#7c4dff', borderBottomRightRadius: 4 },
  bubbleJarvis: { alignSelf: 'flex-start', backgroundColor: '#1f232c', borderWidth: 1, borderColor: '#2a2e38', borderBottomLeftRadius: 4 },
  bubbleSys: { alignSelf: 'center', backgroundColor: 'transparent', maxWidth: '100%' },
  bubbleText: { fontSize: 13.5, color: '#e8eaf0', lineHeight: 20 },
  textRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderColor: '#2a2e38' },
  textInput: { flex: 1, backgroundColor: '#1f232c', borderWidth: 1, borderColor: '#2a2e38', color: '#e8eaf0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  sendBtn: { backgroundColor: '#4dd0e1', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  sendBtnText: { color: '#06232a', fontWeight: '600' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { backgroundColor: '#171a21', borderWidth: 1, borderColor: '#2a2e38', borderRadius: 18, padding: 20, width: '100%', maxWidth: 380 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#e8eaf0', marginBottom: 4 },
  modalDesc: { fontSize: 12, color: '#8b93a7', marginBottom: 16 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, color: '#8b93a7', marginBottom: 5 },
  modalInput: { backgroundColor: '#1f232c', borderWidth: 1, borderColor: '#2a2e38', color: '#e8eaf0', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13 },
  checkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btnGhost: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#2a2e38', alignItems: 'center' },
  btnPrimary: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#4dd0e1', alignItems: 'center' }
});