// DataModel.cs
// Basic data contracts for SynapseAI.

namespace SynapseAI {
    public class ImageAnalysisResult {
        public string Description { get; set; } = string.Empty;
        public float Confidence { get; set; }
    }
}

