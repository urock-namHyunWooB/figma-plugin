import React from "react";
import { css } from "@emotion/react";

export interface RadioProps {
  checked?: boolean; // default: false
  onChange?: (checked: boolean) => void;
  disable?: boolean; // default: false
}

const radioCss = css`
  position: relative;
  width: 24px;
  height: 24px;

  &:disabled {
    opacity: 0.43px;
  }
`;

const radioCss_checkedStyles = {
  true: css`
    filter: drop-shadow(0 3px 8px rgba(98, 140, 245, 0.13));
  `,
};

const radio5949Css = css`
  box-sizing: border-box;
  position: absolute;
  left: 2px;
  top: 2px;
  border: 2px solid var(--Color-line-01, #ededed);
  background: var(--Color-bg-00, #fff);
  width: 20px;
  height: 20px;
  border-radius: 999px;
`;

const radio5949Css_checkedStyles = {
  true: css`
    border: 2px solid var(--Color-primary-01, #628cf5);
    background: var(--Color-bg-03, #f7f9fe);
  `,
};

const radio5950Css = css`
  position: absolute;
  left: 7px;
  top: 7px;
`;

const radio5950Css_checkedStyles = {
  true: css`
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--Color-primary-01, #628cf5);
  `,
};

function Radio(props: RadioProps) {
  const { checked = false, onChange, disable = false, ...restProps } = props;

  return (
    <button
      css={[radioCss, radioCss_checkedStyles?.[checked]]}
      onClick={() => onChange?.(!checked)}
      disabled={disable}
      {...restProps}
    >
      <span css={[radio5949Css, radio5949Css_checkedStyles?.[checked]]}>
        {/* vector: Rectangle 5949 */}
      </span>
      {checked && (
        <span css={[radio5950Css, radio5950Css_checkedStyles?.[checked]]}>
          {/* vector: Rectangle 5950 */}
        </span>
      )}
    </button>
  );
}

export default Radio;
