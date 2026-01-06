import { IconGlyphEditSizeDefault } from "../IconGlyphEditSizeDefault/IconGlyphEditSizeDefault";

export interface IButtonProps {
  size?: "small" | "default" | "large";
  variant?: "default" | "primary" | "danger" | "secondary";
  icon?: "true" | "false";
  className?: string;
}

export const Button = ({
  size = "default",
  variant = "default",
  icon = "false",
  className,
  ...props
}: IButtonProps): JSX.Element => {
  const variantsClassName =
    "size-" + size + " variant-" + variant + " icon-" + icon;

  return (
    <div
      className={
        "bg-light-gray-2 rounded-[3px] pt-[7px] pr-3 pb-[7px] pl-3 flex flex-row gap-2.5 items-center justify-start relative " +
        className +
        " " +
        variantsClassName
      }
    >
      {icon === "true" && (
        <>
          <IconGlyphEditSizeDefault
            glyph="edit"
            className="!shrink-0 !w-3.5 !h-3.5"
          ></IconGlyphEditSizeDefault>
        </>
      )}
      {variant === "secondary" && (
        <>
          <div
            className="text-dark text-left font-['SfProText-Semibold',_sans-serif] text-[13px] leading-[18px] font-semibold relative flex items-center justify-start"
            style={{
              transformOrigin: "0 0",
              transform: "rotate(0deg) scale(1, 1)",
            }}
          >
            Secondary{" "}
          </div>
        </>
      )}
      {(variant === "default" ||
        variant === "primary" ||
        variant === "danger") && (
        <>
          <div
            className="text-dark text-left font-['SfProText-Semibold',_sans-serif] text-[13px] leading-[18px] font-semibold relative flex items-center justify-start"
            style={{
              transformOrigin: "0 0",
              transform: "rotate(0deg) scale(1, 1)",
            }}
          >
            Default{" "}
          </div>
        </>
      )}
    </div>
  );
};
