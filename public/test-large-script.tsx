import React from "react";
import ReactDOM from "react-dom/client";
import Large from "../test/fixtures/failing/compiled/Large";

function TestSuite() {
  const [results, setResults] = React.useState([]);

  React.useEffect(() => {
    setTimeout(() => {
      const newResults = [];
      const test1 = document.getElementById("test1-button");
      if (test1) {
        const span = test1.querySelector("span");
        const color = span ? window.getComputedStyle(span).color : "";
        newResults.push({
          title: "Test 1: Primary disabled=false",
          expected: "rgb(255, 255, 255)",
          actual: color,
          passed: color === "rgb(255, 255, 255)"
        });
      }
      const test2 = document.getElementById("test2-button");
      if (test2) {
        const span = test2.querySelector("span");
        const color = span ? window.getComputedStyle(span).color : "";
        newResults.push({
          title: "Test 2: Primary disabled=true",
          expected: "rgb(255, 255, 255)",
          actual: color,
          passed: color === "rgb(255, 255, 255)"
        });
      }
      const test3 = document.getElementById("test3-button");
      if (test3) {
        const span = test3.querySelector("span");
        const color = span ? window.getComputedStyle(span).color : "";
        newResults.push({
          title: "Test 3: Light disabled=true",
          expected: "rgb(178, 178, 178)",
          actual: color,
          passed: color === "rgb(178, 178, 178)"
        });
      }
      setResults(newResults);
    }, 200);
  }, []);

  return React.createElement("div", null,
    React.createElement("div", { className: "test-section" },
      React.createElement("div", { className: "test-title" }, "Test 1: Primary (disabled=false)"),
      React.createElement("div", { className: "test-preview", id: "test1-button" },
        React.createElement(Large, { color: "Primary", customDisabled: false, text: "Primary Button" })
      ),
      React.createElement("div", { className: results[0] && results[0].passed ? "test-result pass" : "test-result fail" },
        results[0] ? (results[0].passed ? "✓ PASS" : "✗ FAIL") + ": Expected " + results[0].expected + ", got " + results[0].actual : "Measuring..."
      )
    ),
    React.createElement("div", { className: "test-section" },
      React.createElement("div", { className: "test-title" }, "Test 2: Primary (disabled=true)"),
      React.createElement("div", { className: "test-preview", id: "test2-button" },
        React.createElement(Large, { color: "Primary", customDisabled: true, text: "Primary Disabled" })
      ),
      React.createElement("div", { className: results[1] && results[1].passed ? "test-result pass" : "test-result fail" },
        results[1] ? (results[1].passed ? "✓ PASS" : "✗ FAIL") + ": Expected " + results[1].expected + ", got " + results[1].actual : "Measuring..."
      )
    ),
    React.createElement("div", { className: "test-section" },
      React.createElement("div", { className: "test-title" }, "Test 3: Light (disabled=true)"),
      React.createElement("div", { className: "test-preview", id: "test3-button" },
        React.createElement(Large, { color: "Light", customDisabled: true, text: "Light Disabled" })
      ),
      React.createElement("div", { className: results[2] && results[2].passed ? "test-result pass" : "test-result fail" },
        results[2] ? (results[2].passed ? "✓ PASS" : "✗ FAIL") + ": Expected " + results[2].expected + ", got " + results[2].actual : "Measuring..."
      )
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(TestSuite));
