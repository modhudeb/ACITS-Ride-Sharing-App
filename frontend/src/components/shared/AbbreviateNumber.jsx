const AbbreviateNumber = ({ value }) => {
    function formatNumberWithSuffix(number) {
        if (number >= 1000000) {
            return (number / 1000000).toFixed(1) + 'M'
        } else if (number >= 1000) {
            return (number / 1000).toFixed(1) + 'K'
        } else {
            return number.toFixed(0).toString()
        }
    }

    return <>{formatNumberWithSuffix(value)}</>
}

export default AbbreviateNumber
