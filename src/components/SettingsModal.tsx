import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { User, UserSettings } from "../types";
import { Icons, LANGUAGES } from "../constants";
import { auth } from "../firebase";
import { useTranslation } from "../translations";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  settings: UserSettings;
  onUpdateSettings: (s: Partial<UserSettings>) => void;
  onLogout: () => void;
  onDeleteAllSessions?: () => void;
}

type View =
  | "main"
  | "account"
  | "general"
  | "data"
  | "appearance"
  | "about"
  | "language";

const SettingsCard: React.FC<{ children: React.ReactNode; title?: string }> = ({
  children,
  title,
}) => (
  <div className="mb-6">
    {title && (
      <h4 className="px-4 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">
        {title}
      </h4>
    )}
    <div className="bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl overflow-hidden backdrop-blur-md shadow-sm">
      {children}
    </div>
  </div>
);

const SettingsItem: React.FC<{
  icon?: any;
  label: string;
  value?: string;
  onClick?: () => void;
  isDestructive?: boolean;
  type?: "nav" | "toggle" | "info" | "action";
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
}> = ({
  icon: Icon,
  label,
  value,
  onClick,
  isDestructive,
  type = "nav",
  toggleValue,
  onToggle,
}) => (
  <div
    onClick={type !== "toggle" ? onClick : undefined}
    className={`flex items-center gap-4 px-5 py-4 transition-all border-b border-black/5 dark:border-white/5 last:border-0 group ${onClick && type !== "toggle" ? "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10" : ""} ${isDestructive ? "text-red-500 dark:text-red-400" : "text-zinc-800 dark:text-zinc-200"}`}
  >
    {Icon && (
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDestructive ? "bg-red-500/10" : "bg-indigo-500/10 text-indigo-400"}`}
      >
        <Icon className="w-4 h-4" />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <p className="text-[14px] font-medium leading-tight">{label}</p>
    </div>
    <div className="flex items-center gap-3">
      {value && (
        <span className="text-[13px] text-zinc-500 font-medium">{value}</span>
      )}
      {type === "nav" && !isDestructive && (
        <Icons.ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors rtl:rotate-180" />
      )}
      {type === "action" && (
        <Icons.ExternalLink className="w-4 h-4 text-zinc-500 rtl:-scale-x-100" />
      )}
      {type === "toggle" && (
        <button
          onClick={() => onToggle?.(!toggleValue)}
          className={`w-12 h-6 rounded-full relative transition-all duration-500 shrink-0 p-1 group/toggle ${
            toggleValue
              ? "bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.3)]"
              : "bg-zinc-200 dark:bg-zinc-800 shadow-inner"
          }`}
        >
          <div
            className={`absolute inset-0 rounded-full transition-opacity duration-500 bg-gradient-to-r from-indigo-600 to-violet-600 ${toggleValue ? "opacity-100" : "opacity-0"}`}
          />
          <motion.div
            initial={false}
            animate={{
              x: toggleValue
                ? document.documentElement.dir === "rtl"
                  ? -24
                  : 24
                : 0,
              scale: toggleValue ? 1 : 0.9,
            }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`relative w-4 h-4 bg-white rounded-full shadow-[0_2px_5px_rgba(0,0,0,0.2)] z-10 transition-transform group-active/toggle:scale-90`}
          />
        </button>
      )}
    </div>
  </div>
);

const AccountView: React.FC<{ user: User | null; t: any }> = ({ user, t }) => {
  const [editingName, setEditingName] = useState(user?.displayName || "");
  const [editingPhoto, setEditingPhoto] = useState(user?.photoURL || "");
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsUpdating(true);
    try {
      const { updateUserProfile } = await import("../services/firebaseService");
      await updateUserProfile(user.uid, {
        displayName: editingName,
        photoURL: editingPhoto,
      });
    } catch (e) {
      console.error("Failed to update profile", e);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-6 space-y-6"
    >
      <SettingsCard title={t("accountDetails")}>
        <SettingsItem
          icon={Icons.Mail}
          label={t("email")}
          value={user?.email || t("none")}
          type="info"
        />
        <SettingsItem
          icon={Icons.Check}
          label={t("status")}
          value={user?.isCreator ? t("architect") : t("verifiedUser")}
          type="info"
        />
      </SettingsCard>

      <SettingsCard title={t("profile")}>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {t("displayName")}
            </label>
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-all dark:text-white"
              placeholder={t("displayName")}
            />
          </div>
          <button
            onClick={handleUpdateProfile}
            disabled={
              isUpdating ||
              (editingName === user?.displayName &&
                editingPhoto === user?.photoURL)
            }
            className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold text-[14px] hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:grayscale shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
          >
            {isUpdating ? "..." : t("updateProfile")}
          </button>
        </div>
      </SettingsCard>
    </motion.div>
  );
};

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  settings,
  onUpdateSettings,
  onLogout,
  onDeleteAllSessions,
}) => {
  const { t } = useTranslation(settings.language || "en");
  const [view, setView] = useState<View>("main");

  if (!isOpen) return null;

  const renderHeader = (title: string, back: boolean = true) => (
    <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 dark:border-white/5 bg-white/80 dark:bg-black/20 backdrop-blur-xl sticky top-0 z-20">
      <div className="w-10 flex justify-start">
        {back && (
          <button
            onClick={() => setView("main")}
            className="p-2 -ms-2 rounded-xl transition-all text-zinc-500 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 active:scale-90 rtl:rotate-180"
          >
            <Icons.Back className="w-5 h-5" />
          </button>
        )}
      </div>
      <h2 className="font-outfit font-bold text-lg tracking-tight text-black dark:text-white">
        {title}
      </h2>
      <div className="w-10 flex justify-end">
        {!back && (
          <button
            onClick={onClose}
            className="p-2 -me-2 rounded-xl transition-all text-zinc-500 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 active:scale-90"
          >
            <Icons.Close className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (view) {
      case "main":
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 space-y-2"
          >
            {/* Profile Section */}
            <div className="flex items-center gap-4 p-5 bg-indigo-50 dark:bg-indigo-600/10 border border-indigo-100 dark:border-indigo-500/20 rounded-3xl mb-8 relative overflow-hidden group">
              <div className="absolute top-0 end-0 w-32 h-32 bg-indigo-500/10 blur-3xl -me-16 -mt-16 group-hover:bg-indigo-500/20 transition-all duration-700" />
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-2xl relative z-10 ${user?.isCreator ? "bg-amber-500 text-black" : "bg-indigo-600 text-white"}`}
              >
                {user?.displayName?.[0] || "G"}
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white truncate">
                  {user?.displayName || t("guestUser")}
                </h3>
                <p className="text-zinc-500 text-xs truncate">
                  {user?.email || t("guestEmail")}
                </p>
              </div>
              <button
                onClick={() => setView("account")}
                className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all relative z-10 rtl:rotate-180"
              >
                <Icons.ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <SettingsCard title={t("preferences")}>
              <SettingsItem
                icon={Icons.Sun}
                label={t("appearance")}
                value={
                  settings.darkMode === "system"
                    ? t("system")
                    : settings.darkMode
                      ? t("dark")
                      : t("light")
                }
                onClick={() => setView("appearance")}
              />
              <SettingsItem
                icon={Icons.Settings}
                label={t("general")}
                onClick={() => setView("general")}
              />
            </SettingsCard>

            <SettingsCard title={t("securityAndData")}>
              <SettingsItem
                icon={Icons.Database}
                label={t("dataControls")}
                onClick={() => setView("data")}
              />
            </SettingsCard>

            <SettingsCard title={t("support")}>
              <SettingsItem
                icon={Icons.Info}
                label={t("about")}
                onClick={() => setView("about")}
              />
              <SettingsItem
                icon={Icons.MessageSquare}
                label={t("helpAndFeedback")}
                type="action"
                onClick={() => window.open("mailto:sofian20118@gmail.com")}
              />
            </SettingsCard>

            <div className="pt-4">
              <button
                onClick={async () => {
                  try {
                    await auth.signOut();
                    onLogout();
                  } catch (e) {
                    console.error("Logout failed", e);
                  }
                }}
                className="w-full py-4 rounded-2xl font-bold text-[14px] transition-all bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 active:scale-[0.98]"
              >
                {t("logout")}
              </button>
            </div>
          </motion.div>
        );
      case "appearance":
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 space-y-6"
          >
            <SettingsCard title={t("themeMode")}>
              <SettingsItem
                label={t("system")}
                value={settings.darkMode === "system" ? t("active") : ""}
                onClick={() => onUpdateSettings({ darkMode: "system" })}
              />
              <SettingsItem
                label={t("dark")}
                value={settings.darkMode === true ? t("active") : ""}
                onClick={() => onUpdateSettings({ darkMode: true })}
              />
              <SettingsItem
                label={t("light")}
                value={settings.darkMode === false ? t("active") : ""}
                onClick={() => onUpdateSettings({ darkMode: false })}
              />
            </SettingsCard>

            <SettingsCard title={t("interface")}>
              <SettingsItem
                label={t("focusMode")}
                type="toggle"
                toggleValue={settings.focusMode}
                onToggle={(v) => onUpdateSettings({ focusMode: v })}
              />
            </SettingsCard>
            <p className="px-4 text-zinc-500 text-[11px] leading-relaxed">
              {t("focusModeDesc")}
            </p>
          </motion.div>
        );
      case "general":
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 space-y-6"
          >
            <SettingsCard title={t("localization")}>
              <SettingsItem
                label={t("language")}
                value={
                  LANGUAGES.find((l) => l.code === settings.language)?.name ||
                  "English"
                }
                onClick={() => setView("language")}
              />
            </SettingsCard>

            <SettingsCard title={t("responseStyle")}>
              <SettingsItem
                label={t("shortResponses")}
                value={settings.length === "short" ? t("selected") : ""}
                onClick={() => onUpdateSettings({ length: "short" })}
              />
              <SettingsItem
                label={t("detailedResponses")}
                value={settings.length === "detailed" ? t("selected") : ""}
                onClick={() => onUpdateSettings({ length: "detailed" })}
              />
            </SettingsCard>
          </motion.div>
        );
      case "language":
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-6"
          >
            <SettingsCard title={t("selectLanguage")}>
              {LANGUAGES.map((l) => (
                <SettingsItem
                  key={l.code}
                  label={l.name}
                  value={settings.language === l.code ? t("active") : ""}
                  onClick={() => {
                    onUpdateSettings({ language: l.code });
                    setView("general");
                  }}
                />
              ))}
            </SettingsCard>
          </motion.div>
        );
      case "data":
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 space-y-6"
          >
            <SettingsCard title={t("memory")}>
              <SettingsItem
                label={t("bioSyncedMemory")}
                type="toggle"
                toggleValue={settings.memory}
                onToggle={(v) => onUpdateSettings({ memory: v })}
              />
            </SettingsCard>
            <p className="px-4 text-zinc-500 text-[11px] leading-relaxed">
              {t("bioSyncedMemoryDesc")}
            </p>

            {onDeleteAllSessions && (
              <SettingsCard title={t("dataControls")}>
                <SettingsItem
                  icon={Icons.Trash}
                  label={t("deleteAllSessions")}
                  isDestructive
                  onClick={() => {
                    onDeleteAllSessions();
                    onClose();
                  }}
                />
              </SettingsCard>
            )}
          </motion.div>
        );
      case "about":
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-8 flex flex-col items-center justify-center text-center"
          >
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-indigo-600/40 relative group">
              <div className="absolute inset-0 bg-white/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all" />
              <span className="font-poppins font-bold text-white text-2xl relative z-10">
                SA
              </span>
            </div>
            <h3 className="text-2xl font-outfit font-bold mb-2 text-black dark:text-white">
              Sofian AI
            </h3>
            <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-8">
              Version 2.5.0
            </p>

            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-3xl p-6 backdrop-blur-md">
              <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400 italic">
                {t("aboutDesc")}
              </p>
            </div>

            <div className="mt-12 text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-[0.2em]">
              {t("handcraftedWithPassion")}
            </div>
          </motion.div>
        );
      case "account":
        return <AccountView user={user} t={t} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 40 }}
        transition={{ type: "spring", damping: 30, stiffness: 400 }}
        className="relative w-full max-w-sm border border-black/10 dark:border-white/10 rounded-3xl shadow-[0_30px_100px_rgba(0,0,0,0.12)] dark:shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col h-[85vh] sm:h-auto sm:max-h-[700px] bg-white dark:bg-zinc-950"
      >
        {/* Header */}
        {renderHeader(
          view === "main" ? t("settings") : t(view as any),
          view !== "main",
        )}

        <div className="flex-1 overflow-y-auto no-scrollbar bg-zinc-50 dark:bg-gradient-to-b dark:from-zinc-950 dark:to-black">
          <AnimatePresence mode="wait">{renderContent()}</AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default SettingsModal;
