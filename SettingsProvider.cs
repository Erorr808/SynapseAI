// SettingsProvider.cs
// Saves and retrieves simple user/application settings.

using System.Collections.Generic;

namespace SynapseAI {
    public static class SettingsProvider {
        private static readonly Dictionary<string, string> Store = new();

        public static void Set(string key, string value) {
            Store[key] = value;
        }

        public static string Get(string key, string defaultValue = "") {
            return Store.TryGetValue(key, out var value) ? value : defaultValue;
        }
    }
}

