// InferenceService.cs
// C# service that uses ModelWrapper to run AI inference safely.

namespace SynapseAI {
    public class InferenceService {
        private readonly ModelWrapper _wrapper;

        public InferenceService(ModelWrapper wrapper) {
            _wrapper = wrapper;
        }

        public string Predict(string input) {
            return _wrapper.RunInference(input);
        }
    }
}

