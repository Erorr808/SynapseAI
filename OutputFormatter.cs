// OutputFormatter.cs
// Formats raw AI outputs into user-friendly strings.

namespace SynapseAI {
    public static class OutputFormatter {
        public static string AsPlainText(string raw) {
            return raw ?? string.Empty;
        }
    }
}

