import React from "react";
import type { SerializedStyles } from "@emotion/react";
import { css } from "@emotion/react";

interface CircularcircularProps {
  animate?: "False"; // default: "False"
  ratioVertical?: React.ReactNode; // default: null
  shapeBg?: string; // default: "#E1E2E4"
  unionBg?: string; // default: "#E1E2E4"
}

const Circularcircular_circularCss = css`
  display: inline-flex;
  height: 100%;
  align-items: center;
  gap: 10px;
  position: relative;
`;

const Circularcircular_circularVerticalCss = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  align-self: stretch;
  overflow: hidden;
`;

const Circularcircular_circularShapeCss = css`
  width: 28px;
  height: 28px;
  position: absolute;
`;

function Circularcircular(props: CircularcircularProps) {
  const {
    animate = "False",
    ratioVertical = null,
    shapeBg = "#E1E2E4",
    unionBg = "#E1E2E4",
    ...restProps
  } = props;

  return (
    <div css={Circularcircular_circularCss} {...restProps}>
      {ratioVertical && (
        <div css={Circularcircular_circularVerticalCss}>{ratioVertical}</div>
      )}
      <div
        css={Circularcircular_circularShapeCss}
        style={{ background: shapeBg }}
      />
    </div>
  );
}

interface IconsiconsProps {
  prop?: "Null"; // default: "Null"
  icon?: React.ReactNode; // default: null
  iconNormalBlank?: React.ReactNode; // default: null
}

const Iconsicons_iconsCss = css`
  display: inline-flex;
  height: 100%;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const Iconsicons_iconsBlankCss = css`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1 0 0;
`;

function Iconsicons(props: IconsiconsProps) {
  const {
    prop = "Null",
    icon = null,
    iconNormalBlank = null,
    ...restProps
  } = props;

  return (
    <div css={Iconsicons_iconsCss} {...restProps}>
      {iconNormalBlank && (
        <div css={Iconsicons_iconsBlankCss}>{iconNormalBlank}</div>
      )}
    </div>
  );
}

interface ButtonsolidOwnProps {
  leadingIcon?: boolean; // default: false
  trailingIcon?: boolean; // default: false
  label?: string; // default: "텍스트"
  loading?: boolean; // default: false
  variant?: "Primary" | "Assistive"; // default: "Primary"
  size?: "Small" | "Medium" | "Large"; // default: "Large"
  iconOnly?: boolean; // default: false
  disable?: boolean; // default: false
}

export interface ButtonsolidProps
  extends Omit<
      React.ButtonHTMLAttributes<HTMLButtonElement>,
      keyof ButtonsolidOwnProps
    >,
    ButtonsolidOwnProps {}

const solidCss = css`
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  position: relative;
`;

const solidCss_sizeStyles: Record<string, SerializedStyles> = {
  Large: css`
    border-radius: 12px;
  `,
  Medium: css`
    border-radius: 10px;
  `,
  Small: css`
    border-radius: 8px;
  `,
};

const solidCss_variantStyles: Record<string, SerializedStyles> = {
  Assistive: css`
    backdrop-filter: blur(32px);
  `,
};

const solidCss_sizeIconOnlyStyles = [
  {
    size: "Large",
    iconOnly: false,
    css: css`
      padding: 12px 28px;
    `,
  },
  {
    size: "Medium",
    iconOnly: false,
    css: css`
      padding: 9px 20px;
    `,
  },
  {
    size: "Small",
    iconOnly: false,
    css: css`
      padding: 7px 14px;
    `,
  },
  {
    size: "Large",
    iconOnly: true,
    css: css`
      padding: 12px;
    `,
  },
  {
    size: "Medium",
    iconOnly: true,
    css: css`
      padding: 10px;
    `,
  },
  {
    size: "Small",
    iconOnly: true,
    css: css`
      padding: 7px;
    `,
  },
];

const solidCss_variantDisableStyles = [
  {
    variant: "Primary",
    disable: false,
    css: css`
      background: var(--Primary-Normal, #06f);
    `,
  },
  {
    variant: "Primary",
    disable: true,
    css: css`
      background: var(--Interaction-Disable, #f4f4f5);
    `,
  },
  {
    variant: "Assistive",
    disable: false,
    css: css`
      background: var(--Fill-Normal, rgba(112, 115, 124, 0.08));
    `,
  },
  {
    variant: "Assistive",
    disable: true,
    css: css`
      background: var(--Interaction-Disable, #f4f4f5);
    `,
  },
];

const solidLoadingCss = css`
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  flex-direction: row;
`;

const solidLoadingCss_sizeIconOnlyStyles = [
  {
    size: "Large",
    iconOnly: false,
    css: css`
      width: 42px;
      height: 24px;
      padding: 3px 0;
    `,
  },
  {
    size: "Medium",
    iconOnly: false,
    css: css`
      width: 40px;
      height: 22px;
      padding: 3px 0;
    `,
  },
  {
    size: "Small",
    iconOnly: false,
    css: css`
      width: 35px;
      height: 18px;
      padding: 2px 0;
    `,
  },
  {
    size: "Large",
    iconOnly: true,
    css: css`
      width: 24px;
      height: 24px;
      padding: 3px 0;
    `,
  },
  {
    size: "Medium",
    iconOnly: true,
    css: css`
      width: 20px;
      height: 20px;
      padding: 2px 0;
    `,
  },
  {
    size: "Small",
    iconOnly: true,
    css: css`
      width: 18px;
      height: 18px;
      padding: 2px 0;
    `,
  },
];

const circularCircularWrapperCss = css`
  display: flex;
  align-items: center;
  gap: 10px;
  align-self: stretch;
  flex-direction: row;
`;

const circularCircularWrapperCss_sizeStyles: Record<string, SerializedStyles> =
  {
    Large: css`
      height: 18px;
    `,
    Medium: css`
      height: 16px;
    `,
    Small: css`
      height: 14px;
    `,
  };

const solidContentCss = css`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: row;
`;

const solidContentCss_loadingTrue = css`
  visibility: hidden;
`;

const solidContentCss_loadingFalse = undefined;

const solidContentCss_sizeStyles: Record<string, SerializedStyles> = {
  Large: css`
    gap: 6px;
  `,
  Medium: css`
    gap: 5px;
  `,
  Small: css`
    gap: 4px;
  `,
};

const contentSwitchIconCss = css`
  display: flex;
  justify-content: center;
  align-items: center;
  align-self: stretch;
  flex-direction: row;
`;

const contentSwitchIconCss_sizeStyles: Record<string, SerializedStyles> = {
  Large: css`
    padding: 2px 0;
    height: 24px;
  `,
  Medium: css`
    padding: 2px 0;
    height: 22px;
  `,
  Small: css`
    padding: 1px 0;
    height: 18px;
  `,
};

const iconsIconsWrapperCss = css`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  align-self: stretch;
`;

const contentSwitchIconCss_2 = css`
  display: flex;
  justify-content: center;
  align-items: center;
  align-self: stretch;
  flex-direction: row;
`;

const contentSwitchIconCss_2_sizeStyles: Record<string, SerializedStyles> = {
  Large: css`
    padding: 2px 0;
    height: 24px;
  `,
  Medium: css`
    padding: 2px 0;
    height: 22px;
  `,
  Small: css`
    padding: 1px 0;
    height: 18px;
  `,
};

const contentSwitchUnnamedCss = css`
  font-feature-settings: "ss10" on;
  font-family: "Pretendard JP";
  font-style: normal;
`;

const contentSwitchUnnamedCss_variantStyles: Record<string, SerializedStyles> =
  {
    Primary: css`
      font-weight: 600;
    `,
    Assistive: css`
      font-weight: 500;
    `,
  };

const contentSwitchUnnamedCss_sizeStyles: Record<string, SerializedStyles> = {
  Large: css`
    font-size: 16px;
    line-height: 150% /* 24px */;
    letter-spacing: 0.091px;
  `,
  Medium: css`
    font-size: 15px;
    line-height: 146.7% /* 22.005px */;
    letter-spacing: 0.144px;
  `,
  Small: css`
    font-size: 13px;
    line-height: 138.5% /* 18.005px */;
    letter-spacing: 0.252px;
  `,
};

const contentSwitchUnnamedCss_variantDisableStyles = [
  {
    variant: "Primary",
    disable: false,
    css: css`
      color: var(--Semantic-Static-White, var(--Static-White, #fff));
    `,
  },
  {
    variant: "Primary",
    disable: true,
    css: css`
      color: var(
        --Semantic-Label-Assistive,
        var(--Label-Assistive, rgba(55, 56, 60, 0.28))
      );
    `,
  },
  {
    variant: "Assistive",
    disable: false,
    css: css`
      color: var(
        --Semantic-Label-Neutral,
        var(--Label-Neutral, rgba(46, 47, 51, 0.88))
      );
    `,
  },
  {
    variant: "Assistive",
    disable: true,
    css: css`
      color: var(
        --Semantic-Label-Assistive,
        var(--Label-Assistive, rgba(55, 56, 60, 0.28))
      );
    `,
  },
];

const iconsIconsWrapperCss_3 = css`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const iconsIconsWrapperCss_3_sizeStyles: Record<string, SerializedStyles> = {
  Large: css`
    height: 24px;
  `,
  Medium: css`
    height: 20px;
  `,
  Small: css`
    height: 18px;
  `,
};

export default function Buttonsolid(props: ButtonsolidProps) {
  const {
    leadingIcon = false,
    trailingIcon = false,
    label = "텍스트",
    loading = false,
    variant = "Primary",
    size = "Large",
    iconOnly = false,
    disable = false,
    ...restProps
  } = props;

  return (
    <button
      css={[
        solidCss,
        solidCss_sizeStyles?.[size],
        solidCss_variantStyles?.[variant],
        solidCss_sizeIconOnlyStyles.find(
          (v) => v.size === size && v.iconOnly === iconOnly
        )?.css,
        solidCss_variantDisableStyles.find(
          (v) => v.variant === variant && v.disable === disable
        )?.css,
      ]}
      {...restProps}
    >
      {loading && !disable && (
        <div
          css={[
            solidLoadingCss,
            solidLoadingCss_sizeIconOnlyStyles.find(
              (v) => v.size === size && v.iconOnly === iconOnly
            )?.css,
          ]}
        >
          <div
            css={[
              circularCircularWrapperCss,
              circularCircularWrapperCss_sizeStyles?.[size],
            ]}
          >
            <Circularcircular shapeBg="#FFFFFF" unionBg="#FFFFFF" />
          </div>
        </div>
      )}
      <div
        css={[
          solidContentCss,
          loading ? solidContentCss_loadingTrue : solidContentCss_loadingFalse,
          solidContentCss_sizeStyles?.[size],
        ]}
      >
        {iconOnly ? (
          <div
            css={[
              iconsIconsWrapperCss_3,
              iconsIconsWrapperCss_3_sizeStyles?.[size],
            ]}
          >
            <Iconsicons />
          </div>
        ) : (
          <>
            {leadingIcon && (
              <div
                css={[
                  contentSwitchIconCss,
                  contentSwitchIconCss_sizeStyles?.[size],
                ]}
              >
                <div css={iconsIconsWrapperCss}>
                  <Iconsicons />
                </div>
              </div>
            )}
            {trailingIcon && (
              <div
                css={[
                  contentSwitchIconCss_2,
                  contentSwitchIconCss_2_sizeStyles?.[size],
                ]}
              >
                <div css={iconsIconsWrapperCss}>
                  <Iconsicons />
                </div>
              </div>
            )}
            {label && (
              <span
                css={[
                  contentSwitchUnnamedCss,
                  contentSwitchUnnamedCss_variantStyles?.[variant],
                  contentSwitchUnnamedCss_sizeStyles?.[size],
                  contentSwitchUnnamedCss_variantDisableStyles.find(
                    (v) => v.variant === variant && v.disable === disable
                  )?.css,
                ]}
              >
                {label}
              </span>
            )}
          </>
        )}
      </div>
    </button>
  );
}
