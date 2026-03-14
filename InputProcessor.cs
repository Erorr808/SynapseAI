// InputProcessor.cs
// Prepares raw user input for AI consumption.

namespace SynapseAI {
    public static class InputProcessor {
        public static string Normalize(string input) {
            return (input ?? string.Empty).Trim();
        }
    }
}

