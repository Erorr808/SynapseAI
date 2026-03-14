// Program.cs
// Entry point for a simple .NET console app using SynapseAI.

using System;

namespace SynapseAI {
    internal static class Program {
        private static void Main(string[] args) {
            var wrapper = new ModelWrapper("path/to/model");
            var service = new InferenceService(wrapper);
            Console.WriteLine("SynapseAI .NET stub. Type text and press Enter, or /exit to quit.");
            while (true) {
                Console.Write("> ");
                var line = Console.ReadLine();
                if (line == null || line.Trim().Equals("/exit", StringComparison.OrdinalIgnoreCase)) {
                    break;
                }
                var output = service.Predict(line);
                Console.WriteLine(output);
            }
        }
    }
}

