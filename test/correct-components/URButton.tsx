import React, { useState } from "react";

// 타입 정의
type ButtonSize = "default" | "small" | "large";
type ButtonType = "default" | "link" | "primary" | "warning" | "destructive";

// Button 컴포넌트 Props 인터페이스
interface ButtonProps {
  /** 버튼 크기 */
  size?: ButtonSize;
  /** 버튼 타입/스타일 */
  type?: ButtonType;
  /** 버튼에 표시될 텍스트 */
  text?: string;
  /** 버튼 비활성화 여부 */
  isDisabled?: boolean;
  /** 클릭 이벤트 핸들러 */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

// 내부 상태 인터페이스
interface ButtonInternalState {
  llll: string;
}

// 스타일 맵 인터페이스
interface StyleMap {
  [key: string]: string;
}

const Button: React.FC<ButtonProps> = ({
  size = "default",
  type = "default",
  text = "Button",
  isDisabled = false,
  onClick,
}) => {
  // 내부 상태
  const [internalState, setInternalState] = useState<ButtonInternalState>({
    llll: "",
  });

  // 크기에 따른 스타일
  const sizeStyles: StyleMap = {
    small: "px-3 py-1.5 text-sm",
    default: "px-4 py-2 text-base",
    large: "px-4 py-2 text-lg",
  };

  // 타입에 따른 스타일
  const typeStyles: StyleMap = {
    default: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50",
    link: "bg-transparent text-blue-600 hover:underline border-0",
    primary: "bg-teal-600 text-white hover:bg-teal-700 border-0",
    warning: "bg-black text-white hover:bg-gray-800 border-0",
    destructive: "bg-red-600 text-white hover:bg-red-700 border-0",
  };

  // disabled 스타일
  const disabledStyle: string = "opacity-50 cursor-not-allowed";

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (!isDisabled && onClick) {
      onClick(event);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`
        rounded
        font-medium
        transition-colors
        ${sizeStyles[size]}
        ${typeStyles[type]}
        ${isDisabled ? disabledStyle : ""}
      `}
    >
      {text}
    </button>
  );
};

// 데모 컴포넌트 Props 인터페이스
interface ButtonDemoProps {}

// 데모 컴포넌트
const ButtonDemo: React.FC<ButtonDemoProps> = () => {
  const handleButtonClick = (buttonName: string) => {
    console.log(`${buttonName} clicked!`);
  };

  return (
    <div className="p-8 space-y-8 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">
          Button Component Demo
        </h1>

        {/* 타입별 버튼 */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Types</h2>
          <div className="flex flex-wrap gap-4">
            <Button
              type="default"
              text="Default"
              onClick={() => handleButtonClick("Default")}
            />
            <Button
              type="link"
              text="Link"
              onClick={() => handleButtonClick("Link")}
            />
            <Button
              type="primary"
              text="Primary"
              onClick={() => handleButtonClick("Primary")}
            />
            <Button
              type="warning"
              text="Warning"
              onClick={() => handleButtonClick("Warning")}
            />
            <Button
              type="destructive"
              text="Destructive"
              onClick={() => handleButtonClick("Destructive")}
            />
          </div>
        </div>

        {/* 크기별 버튼 */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Sizes</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="small" type="primary" text="Small" />
            <Button size="default" type="primary" text="Default" />
            <Button size="large" type="primary" text="Large" />
          </div>
        </div>

        {/* Disabled 상태 */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">
            Disabled State
          </h2>
          <div className="flex flex-wrap gap-4">
            <Button type="default" text="Default Disabled" isDisabled={true} />
            <Button type="primary" text="Primary Disabled" isDisabled={true} />
            <Button
              type="destructive"
              text="Destructive Disabled"
              isDisabled={true}
            />
          </div>
        </div>

        {/* 조합 예시 */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-700">
            Combinations
          </h2>
          <div className="flex flex-wrap gap-4">
            <Button size="small" type="default" text="Small Default" />
            <Button size="small" type="primary" text="Small Primary" />
            <Button size="large" type="warning" text="Large Warning" />
            <Button size="large" type="destructive" text="Large Destructive" />
          </div>
        </div>

        {/* 사용 예시 코드 */}
        <div className="mt-8 p-4 bg-gray-100 rounded">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">
            Usage Example:
          </h3>
          <pre className="text-sm text-gray-600 overflow-x-auto">
            {`<Button 
  size="large"
  type="primary"
  text="Click Me"
  isDisabled={false}
  onClick={(e) => console.log('Clicked!')}
/>`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ButtonDemo;
