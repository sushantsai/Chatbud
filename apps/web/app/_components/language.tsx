"use client";
import { createContext, useContext, useEffect, useState } from "react";
type Language = "en" | "ne" | "hi";
const words: Record<string, [string, string]> = {
  Home: ["गृह", "होम"],
  Care: ["हेरचाह", "देखभाल"],
  Appointments: ["अपोइन्टमेन्ट", "अपॉइंटमेंट"],
  Store: ["पसल", "स्टोर"],
  "My Health": ["मेरो स्वास्थ्य", "मेरा स्वास्थ्य"],
  Help: ["सहयोग", "सहायता"],
  "Sign in": ["साइन इन", "साइन इन"],
  "Choose a time": ["समय छान्नुहोस्", "समय चुनें"],
  "Review & pay": ["समीक्षा र भुक्तानी", "समीक्षा और भुगतान"],
  "Date & time": ["मिति र समय", "तारीख और समय"],
  Account: ["खाता", "खाता"],
  Intake: ["प्रारम्भिक विवरण", "प्रारंभिक जानकारी"],
  "All prices": ["सबै मूल्य", "सभी मूल्य"],
  Filters: ["फिल्टर", "फ़िल्टर"],
  "Clear filters": ["फिल्टर हटाउनुहोस्", "फ़िल्टर हटाएँ"],
  "View profile": ["प्रोफाइल हेर्नुहोस्", "प्रोफ़ाइल देखें"],
  "Next appointment": ["अर्को अपोइन्टमेन्ट", "अगला अपॉइंटमेंट"],
  "Your next steps": ["तपाईंका आगामी काम", "आपके अगले कदम"],
  "Join session": ["सत्रमा जोडिनुहोस्", "सत्र में शामिल हों"],
  "Awaiting approval": ["स्वीकृतिको प्रतीक्षामा", "स्वीकृति की प्रतीक्षा"],
  Confirmed: ["पुष्टि भयो", "पुष्टि हुई"],
  "Refund eligible": ["फिर्ताका लागि योग्य", "धनवापसी के योग्य"],
  "Refund completed": ["रकम फिर्ता भयो", "धनवापसी पूरी हुई"],
  "View appointment": ["अपोइन्टमेन्ट हेर्नुहोस्", "अपॉइंटमेंट देखें"],
  Continue: ["अगाडि बढ्नुहोस्", "आगे बढ़ें"],
  Back: ["पछाडि", "वापस"],
  "Booking details": ["बुकिङ विवरण", "बुकिंग विवरण"],
  "Your bag": ["तपाईंको झोला", "आपका बैग"],
  "Browse care": ["हेरचाह खोज्नुहोस्", "देखभाल खोजें"],
  "Mental health": ["मानसिक स्वास्थ्य", "मानसिक स्वास्थ्य"],
  Nutrition: ["पोषण", "पोषण"],
  Fitness: ["तन्दुरुस्ती", "फिटनेस"],
  "Contact support": ["सहयोग सम्पर्क", "सहायता से संपर्क करें"],
  "Payment needed": ["भुक्तानी आवश्यक", "भुगतान आवश्यक"],
  "No upcoming appointments": [
    "आगामी अपोइन्टमेन्ट छैन",
    "कोई आगामी अपॉइंटमेंट नहीं",
  ],
  "Appointment details": ["अपोइन्टमेन्ट विवरण", "अपॉइंटमेंट विवरण"],
  "Detailed timeline": ["विस्तृत समयरेखा", "विस्तृत समयरेखा"],
  "Cancel request": ["अनुरोध रद्द गर्नुहोस्", "अनुरोध रद्द करें"],
  "Request reschedule": ["समय परिवर्तन अनुरोध", "समय बदलने का अनुरोध"],
  Availability: ["उपलब्धता", "उपलब्धता"],
  Services: ["सेवाहरू", "सेवाएँ"],
  About: ["परिचय", "परिचय"],
  Language: ["भाषा", "भाषा"],
};
const Context = createContext({
  language: "en" as Language,
  setLanguage: (_: Language) => {},
  t: (s: string) => s,
});
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  useEffect(() => {
    const saved = localStorage.getItem("chatbud-language");
    if (saved === "ne" || saved === "hi") setLanguage(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem("chatbud-language", language);
  }, [language]);
  return (
    <Context.Provider
      value={{
        language,
        setLanguage,
        t: (s) =>
          language === "en" ? s : words[s]?.[language === "ne" ? 0 : 1] || s,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useLanguage = () => useContext(Context);
export function LanguageSelect() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <select
      className="language-select"
      aria-label={t("Language")}
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
    >
      <option value="en">English</option>
      <option value="ne">नेपाली</option>
      <option value="hi">हिन्दी</option>
    </select>
  );
}
