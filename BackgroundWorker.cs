// BackgroundWorker.cs
// Ensures AI runs off the UI thread.

using System;
using System.Threading.Tasks;

namespace SynapseAI {
    public static class BackgroundWorker {
        public static Task RunAsync(Func<Task> work) {
            return Task.Run(work);
        }
    }
}

