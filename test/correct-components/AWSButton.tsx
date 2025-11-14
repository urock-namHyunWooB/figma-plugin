import React, { useState } from "react";

interface Props {
  text: string;
  size: "default" | "small" | "large";
  type: "default" | "link" | "primary" | "warning" | "destructive";
  isDisabled: boolean;
}

function AWSButton({
  text,
  size = "default",
  type = "default",
  isDisabled = false,
}: Props) {
  const [llll, setLllll] = useState<string>("");

  return <button>{text}</button>;
}
