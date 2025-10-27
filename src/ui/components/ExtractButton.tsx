import React from "react";

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

  return <button onClick={handleExtract}>Extract</button>;
}

export default ExtractButton;
