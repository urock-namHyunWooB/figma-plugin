import { useState } from "react";

interface URButtonProps {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  text: string;
}

function URButton({ leftIcon, rightIcon, text }: URButtonProps) {
  const [count, setCount] = useState(0);

  return (
    <>
      <div>
        <div>{leftIcon}</div>
      </div>
      <div>
        <span>{text}</span>
      </div>
      <div>
        <div>{rightIcon}</div>
      </div>
    </>
  );
}
