function ExtractButton() {
  const handleExtract = () => {
    parent.postMessage(
      {
        pluginMessage: {
          type: "extract-json",
        },
      },
      "*"
    );
  };

  return (
    <button
      onClick={handleExtract}
      className="w-full py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors mb-2"
    >
      JSON 추출
    </button>
  );
}

export default ExtractButton;
