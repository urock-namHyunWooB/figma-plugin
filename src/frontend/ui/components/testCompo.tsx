import React from "react";
export interface llProps {
  variant?: "Size=Large, State=Disabled, Left Icon=False, Right Icon=False";
}
export function ll(
  props: Size = Large,
  State = Disabled,
  LeftIcon = False,
  RightIcon = FalseProps
) {
  const {
    variant = "Size=Large, State=Disabled, Left Icon=False, Right Icon=False",
  } = props;
  return (
    <div
      id={
        variant ===
        "Size=Large, State=Disabled, Left Icon=False, Right Icon=False"
          ? "15:12969"
          : variant ===
              "Size=Large, State=Disabled, Left Icon=True, Right Icon=False"
            ? "15:12972"
            : variant ===
                "Size=Large, State=Disabled, Left Icon=False, Right Icon=True"
              ? "15:12977"
              : "15:12982"
      }
      name={
        variant ===
        "Size=Large, State=Disabled, Left Icon=False, Right Icon=False"
          ? "Size=Large, State=Disabled, Left Icon=False, Right Icon=False"
          : variant ===
              "Size=Large, State=Disabled, Left Icon=True, Right Icon=False"
            ? "Size=Large, State=Disabled, Left Icon=True, Right Icon=False"
            : variant ===
                "Size=Large, State=Disabled, Left Icon=False, Right Icon=True"
              ? "Size=Large, State=Disabled, Left Icon=False, Right Icon=True"
              : "Size=Medium, State=Disabled, Left Icon=False, Right Icon=False"
      }
      isMask={false}
      style={
        variant ===
        "Size=Large, State=Disabled, Left Icon=False, Right Icon=False"
          ? null
          : variant ===
              "Size=Large, State=Disabled, Left Icon=True, Right Icon=False"
            ? null
            : variant ===
                "Size=Large, State=Disabled, Left Icon=False, Right Icon=True"
              ? null
              : null
      }
      visible={null}
      x={null}
      y={null}
      width={null}
      height={null}
    >
      {variant ===
        "Size=Large, State=Disabled, Left Icon=False, Right Icon=False" && (
        <div
          id={
            variant ===
            "Size=Large, State=Disabled, Left Icon=False, Right Icon=False"
              ? "15:12970"
              : variant ===
                  "Size=Large, State=Disabled, Left Icon=True, Right Icon=False"
                ? "15:12973"
                : variant ===
                    "Size=Large, State=Disabled, Left Icon=False, Right Icon=True"
                  ? "15:12978"
                  : "15:12983"
          }
          name={"Min Width"}
          isMask={false}
          style={null}
          visible={null}
          x={null}
          y={null}
          width={null}
          height={null}
        ></div>
      )}
      {variant ===
        "Size=Large, State=Disabled, Left Icon=False, Right Icon=True" && (
        <div
          id={"15:12979"}
          name={"Frame 427318163"}
          isMask={false}
          style={null}
        >
          {variant ===
            "Size=Large, State=Disabled, Left Icon=False, Right Icon=True" && (
            <span
              id={"15:12980"}
              name={"Text"}
              isMask={false}
              style={null}
            ></span>
          )}
          {variant ===
            "Size=Large, State=Disabled, Left Icon=False, Right Icon=True" && (
            <Plus id={"15:12981"} name={"Plus"} isMask={false} style={null}>
              {variant ===
                "Size=Large, State=Disabled, Left Icon=False, Right Icon=True" && (
                <div
                  id={"I15:12981;297:22915"}
                  name={"Union"}
                  isMask={false}
                  style={null}
                ></div>
              )}
            </Plus>
          )}
        </div>
      )}
      {variant ===
        "Size=Large, State=Disabled, Left Icon=True, Right Icon=False" && (
        <div
          id={"15:12974"}
          name={"Frame 427318163"}
          isMask={false}
          style={null}
        >
          {variant ===
            "Size=Large, State=Disabled, Left Icon=True, Right Icon=False" && (
            <Plus id={"15:12975"} name={"Plus"} isMask={false} style={null}>
              {variant ===
                "Size=Large, State=Disabled, Left Icon=True, Right Icon=False" && (
                <div
                  id={"I15:12975;297:22915"}
                  name={"Union"}
                  isMask={false}
                  style={null}
                ></div>
              )}
            </Plus>
          )}
          {variant ===
            "Size=Large, State=Disabled, Left Icon=True, Right Icon=False" && (
            <span
              id={"15:12976"}
              name={"Text"}
              isMask={false}
              style={null}
            ></span>
          )}
        </div>
      )}
      {variant ===
        "Size=Large, State=Disabled, Left Icon=False, Right Icon=False" && (
        <span
          id={
            variant ===
            "Size=Large, State=Disabled, Left Icon=False, Right Icon=False"
              ? "15:12971"
              : "15:12984"
          }
          name={"Text"}
          isMask={false}
          style={null}
          visible={null}
          x={null}
          y={null}
          width={null}
          height={null}
        ></span>
      )}
    </div>
  );
}
