// ErrorManager.cs
// Centralized error handling for SynapseAI C# apps.

using System;

namespace SynapseAI {
    public static class ErrorManager {
        public static void Handle(Exception ex) {
            Console.Error.WriteLine($"[SynapseAI Error] {ex.Message}");
        }
    }
}

