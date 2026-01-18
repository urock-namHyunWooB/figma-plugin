import React from "react";

export interface YellowProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

const cn = (...classes: (string | undefined | null | false)[]) =>
  classes.filter(Boolean).join(" ");

export default function Yellow(props: YellowProps) {
  const { children, ...restProps } = props;
  return (
    <div
      className={"flex w-[264px] flex-col items-start gap-[16px]"}
      {...restProps}
    >
      <div
        className={
          "flex pr-[116px] items-center gap-[16px] self-stretch relative"
        }
      >
        <div
          className={
            "w-[40px] h-[40px] rounded-[3px] absolute left-0 top-0 [background-color:var(--yellowBright,_#FCB400)]"
          }
        />
        <span
          className={
            "text-[15px] not-italic leading-[20px] absolute left-[56px] top-[10px] [color:var(--Dark,_#333)] [font-family:SF_Pro_Text] [font-weight:400]"
          }
        >
          Yellow bright
        </span>
      </div>
      <div
        className={
          "flex pr-[163px] items-center gap-[16px] self-stretch relative"
        }
      >
        <div
          className={
            "w-[40px] h-[40px] rounded-[3px] absolute left-0 top-0 [background-color:var(--yellow,_#E08D00)]"
          }
        />
        <span
          className={
            "text-[15px] not-italic leading-[20px] absolute left-[56px] top-[10px] [color:var(--Dark,_#333)] [font-family:SF_Pro_Text] [font-weight:400]"
          }
        >
          Yellow
        </span>
      </div>
      <div
        className={
          "flex pr-[116px] items-center gap-[16px] self-stretch relative"
        }
      >
        <div
          className={
            "w-[40px] h-[40px] rounded-[3px] absolute left-0 top-0 [background-color:var(--yellowDark1,_#B87503)]"
          }
        />
        <span
          className={
            "text-[15px] not-italic leading-[20px] absolute left-[56px] top-[10px] [color:var(--Dark,_#333)] [font-family:SF_Pro_Text] [font-weight:400]"
          }
        >
          Yellow dark 1
        </span>
      </div>
      <div
        className={
          "flex pr-[116px] items-center gap-[16px] self-stretch relative"
        }
      >
        <div
          className={
            "w-[40px] h-[40px] rounded-[3px] absolute left-0 top-0 [background-color:var(--yellowLight1,_#FFD66E)]"
          }
        />
        <span
          className={
            "text-[15px] not-italic leading-[20px] absolute left-[56px] top-[10px] [color:var(--Dark,_#333)] [font-family:SF_Pro_Text] [font-weight:400]"
          }
        >
          Yellow light 1
        </span>
      </div>
      <div
        className={
          "flex pr-[114px] items-center gap-[16px] self-stretch relative"
        }
      >
        <div
          className={
            "w-[40px] h-[40px] rounded-[3px] absolute left-0 top-0 [background-color:var(--yellowLight2,_#FFEAB6)]"
          }
        />
        <span
          className={
            "text-[15px] not-italic leading-[20px] absolute left-[56px] top-[10px] [color:var(--Dark,_#333)] [font-family:SF_Pro_Text] [font-weight:400]"
          }
        >
          Yellow light 2
        </span>
      </div>
      {children}
    </div>
  );
}
