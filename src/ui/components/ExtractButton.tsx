import React from "react";

function ExtractButton() {
  const handleExtract = () => {
    console.log("Extract");
  };

  return <button onClick={handleExtract}>Extract</button>;
}

export default ExtractButton;
