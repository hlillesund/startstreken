import { forwardRef } from "react";

type SearchBoxProps = {
  variant?: "light" | "dark";
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
};

const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(
  ({ variant, placeholder, value, onChange, onSubmit }, ref) => {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        className={`searchBox ${
          variant === "light" ? "searchBox--light" : ""
        }`}
      >
        <input
          ref={ref}
          autoFocus={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`searchInput ${
            variant === "light" ? "searchInput--light" : ""
          }`}
        />

        
      <button
        className={`searchButton ${
          variant === "light" ? "searchButton--light" : ""
        }`}
        type="button"
        aria-label="Search"
        onClick={onSubmit}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="29"
          height="29"
          viewBox="0 0 29 29"
          fill="none"
        >
          <path
            d="M23.7953 23.9182L19.0585 19.1814M19.0585 19.1814C20.5987 17.6412 21.4566 15.5845 21.4566 13.3919C21.4566 11.1993 20.5987 9.14263 19.0585 7.60242C17.5183 6.06221 15.4616 5.20435 13.269 5.20435C11.0764 5.20435 9.01974 6.06221 7.47953 7.60242C5.94407 9.13789 5.08145 11.2204 5.08145 13.3919C5.08145 15.5634 5.94407 17.6459 7.47953 19.1814C9.01499 20.7168 11.0975 21.5794 13.269 21.5794C15.4405 21.5794 17.523 20.7168 19.0585 19.1814Z"
            stroke={variant === "light" ? "black" : "white"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      </form>
    );
  }
);

SearchBox.displayName = "SearchBox";
export default SearchBox;